using Microsoft.EntityFrameworkCore;
using Talab.Application.Notifications;
using Talab.Application.Realtime;
using Talab.Domain.Entities;

namespace Talab.Application.Verification;

/// <summary>Port for private file storage. Implementations must encrypt at rest.</summary>
public interface IFileStore
{
    Task<string> Save(byte[] bytes, CancellationToken ct);
    Task<byte[]?> Read(string key, CancellationToken ct);
    Task Delete(string key, CancellationToken ct);
}

public record VerificationStatusDto(string Status, string? Reason, DateTime? SubmittedAt);
public record AdminVerification(Guid Id, Guid UserId, string Name, string Email, string Status, string? Reason, DateTime SubmittedAt);

public static class ImageRules
{
    public const int MaxBytes = 5 * 1024 * 1024;

    /// <summary>Content type from the file's first bytes (never trust the client's header). Null if not JPEG/PNG.</summary>
    public static string? Sniff(byte[] b) =>
        b.Length > 8 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF ? "image/jpeg" :
        b.Length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47 ? "image/png" : null;

    public static void Check(byte[] b, string label)
    {
        if (b.Length == 0) throw new DomainException($"Add the {label}.");
        if (b.Length > MaxBytes) throw new DomainException($"The {label} is too big. Use a photo under 5 MB.");
        if (Sniff(b) is null) throw new DomainException($"The {label} must be a JPG or PNG photo.");
    }
}

// ---------- owner ----------
public record GetMyVerificationQuery(Guid UserId) : IQuery<VerificationStatusDto>;

public class GetMyVerificationHandler(IAppDb db) : IQueryHandler<GetMyVerificationQuery, VerificationStatusDto>
{
    public async Task<VerificationStatusDto> Handle(GetMyVerificationQuery q, CancellationToken ct)
    {
        var v = await db.OwnerVerifications.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == q.UserId, ct);
        return v is null ? new("None", null, null) : new(v.Status.ToString(), v.RejectReason, v.SubmittedAt);
    }
}

/// <summary>Submit (or re-submit after a rejection) the three photos. Replaces and deletes older files.</summary>
public record SubmitVerificationCommand(Guid UserId, byte[] Front, byte[] Back, byte[] Selfie) : ICommand<bool>;

public class SubmitVerificationHandler(IAppDb db, IFileStore files, IRealtime realtime) : ICommandHandler<SubmitVerificationCommand, bool>
{
    public async Task<bool> Handle(SubmitVerificationCommand c, CancellationToken ct)
    {
        ImageRules.Check(c.Front, "front of your CNIC");
        ImageRules.Check(c.Back, "back of your CNIC");
        ImageRules.Check(c.Selfie, "selfie");

        var v = await db.OwnerVerifications.FirstOrDefaultAsync(x => x.UserId == c.UserId, ct);
        if (v?.Status == VerificationStatus.Approved) throw new DomainException("You are already verified.");
        if (v?.Status == VerificationStatus.Pending) throw new DomainException("Your documents are already being reviewed.");

        var old = v is null ? [] : new[] { v.FrontKey, v.BackKey, v.SelfieKey };
        if (v is null) { v = new OwnerVerification { UserId = c.UserId }; db.OwnerVerifications.Add(v); }
        v.FrontKey = await files.Save(c.Front, ct);
        v.BackKey = await files.Save(c.Back, ct);
        v.SelfieKey = await files.Save(c.Selfie, ct);
        v.Status = VerificationStatus.Pending; v.RejectReason = null; v.SubmittedAt = DateTime.UtcNow; v.ReviewedAt = null; v.ReviewedBy = null;
        await db.SaveChangesAsync(ct);

        foreach (var k in old) await files.Delete(k, ct);
        await realtime.ToGroup(RealtimeGroups.Admins, RealtimeEvents.Admin, new { kind = "verification" });
        return true;
    }
}

// ---------- admin ----------
public record ListVerificationsQuery(VerificationStatus? Status = null) : IQuery<List<AdminVerification>>;

public class ListVerificationsHandler(IAppDb db) : IQueryHandler<ListVerificationsQuery, List<AdminVerification>>
{
    public Task<List<AdminVerification>> Handle(ListVerificationsQuery q, CancellationToken ct) =>
        (from v in db.OwnerVerifications.AsNoTracking()
         join u in db.Users on v.UserId equals u.Id
         where q.Status == null || v.Status == q.Status
         orderby v.SubmittedAt
         select new AdminVerification(v.Id, u.Id, u.Name, u.Email, v.Status.ToString(), v.RejectReason, v.SubmittedAt))
        .Take(200).ToListAsync(ct);
}

public record GetVerificationQuery(Guid Id) : IQuery<AdminVerification>;

public class GetVerificationHandler(IAppDb db) : IQueryHandler<GetVerificationQuery, AdminVerification>
{
    public async Task<AdminVerification> Handle(GetVerificationQuery q, CancellationToken ct) =>
        await (from v in db.OwnerVerifications.AsNoTracking()
               join u in db.Users on v.UserId equals u.Id
               where v.Id == q.Id
               select new AdminVerification(v.Id, u.Id, u.Name, u.Email, v.Status.ToString(), v.RejectReason, v.SubmittedAt))
            .FirstOrDefaultAsync(ct) ?? throw new DomainException("Verification not found.");
}

public record ImageResult(byte[] Bytes, string ContentType);
public record GetVerificationImageQuery(Guid Id, string Which) : IQuery<ImageResult>;

public class GetVerificationImageHandler(IAppDb db, IFileStore files) : IQueryHandler<GetVerificationImageQuery, ImageResult>
{
    public async Task<ImageResult> Handle(GetVerificationImageQuery q, CancellationToken ct)
    {
        var v = await db.OwnerVerifications.AsNoTracking().FirstOrDefaultAsync(x => x.Id == q.Id, ct) ?? throw new DomainException("Verification not found.");
        var key = q.Which switch { "front" => v.FrontKey, "back" => v.BackKey, "selfie" => v.SelfieKey, _ => throw new DomainException("Unknown image.") };
        var bytes = await files.Read(key, ct) ?? throw new DomainException("Image not found.");
        return new ImageResult(bytes, ImageRules.Sniff(bytes) ?? "application/octet-stream");
    }
}

public record ReviewVerificationCommand(Guid AdminId, Guid Id, bool Approve, string? Reason) : ICommand<bool>;

public class ReviewVerificationHandler(IAppDb db, INotifier notifier, IRealtime realtime) : ICommandHandler<ReviewVerificationCommand, bool>
{
    public async Task<bool> Handle(ReviewVerificationCommand c, CancellationToken ct)
    {
        var v = await db.OwnerVerifications.FirstOrDefaultAsync(x => x.Id == c.Id, ct) ?? throw new DomainException("Verification not found.");
        if (v.Status != VerificationStatus.Pending) throw new DomainException($"Already {v.Status.ToString().ToLower()}.");
        var reason = c.Reason?.Trim();
        if (!c.Approve && string.IsNullOrEmpty(reason)) throw new DomainException("Tell the owner why it was rejected.");
        if (reason?.Length > 300) throw new DomainException("The reason is too long.");

        var user = await db.Users.FirstAsync(u => u.Id == v.UserId, ct);
        v.Status = c.Approve ? VerificationStatus.Approved : VerificationStatus.Rejected;
        v.RejectReason = c.Approve ? null : reason;
        v.ReviewedAt = DateTime.UtcNow; v.ReviewedBy = c.AdminId;
        user.Verified = c.Approve;
        await db.SaveChangesAsync(ct);

        if (c.Approve) await notifier.Send(user.Id, NotificationType.Verification, "You are verified", "Your documents were approved. You can now send offers.", "/owner", null, null, ct);
        else await notifier.Send(user.Id, NotificationType.Verification, "Verification was not approved", "{reason}", "/owner/verify", new() { ["reason"] = reason! }, null, ct);
        await realtime.ToUser(user.Id, RealtimeEvents.Refresh, new { scope = "verification" });
        await realtime.ToGroup(RealtimeGroups.Admins, RealtimeEvents.Admin, new { kind = "verification" });
        return true;
    }
}
