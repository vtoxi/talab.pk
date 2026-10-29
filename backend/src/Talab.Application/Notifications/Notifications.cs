using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Talab.Application.Realtime;
using Talab.Domain.Entities;

namespace Talab.Application.Notifications;

public static class Texts
{
    public static string Money(decimal v) => "Rs " + v.ToString("N0", System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>Fills {placeholders} in one pass (values are never re-scanned).</summary>
    public static string Fill(string template, IReadOnlyDictionary<string, string>? args) =>
        args is null ? template : System.Text.RegularExpressions.Regex.Replace(template, @"\{(\w+)\}", m => args.TryGetValue(m.Groups[1].Value, out var v) ? v : m.Value);

    public static string TypeOf(string details)
    {
        try { return System.Text.Json.JsonDocument.Parse(details).RootElement.GetProperty("type").GetString() ?? "property"; }
        catch { return "property"; }
    }
}

public record EmailMessage(string To, string Subject, string Body, string Link);

/// <summary>Port: hands an email to the background sender. Never blocks or throws.</summary>
public interface IEmailQueue { void Enqueue(EmailMessage message); }

/// <summary>Creates the in-app notification and queues the email. Failures are logged, never thrown, so they cannot break the action that triggered them.</summary>
public interface INotifier
{
    Task Send(Guid userId, NotificationType type, string titleTemplate, string bodyTemplate, string link,
        Dictionary<string, string>? args = null, string? coalesceKey = null, CancellationToken ct = default);
}

public class Notifier(IAppDb db, IEmailQueue emails, IRealtime realtime, ILogger<Notifier> log) : INotifier
{
    public async Task Send(Guid userId, NotificationType type, string title, string body, string link,
        Dictionary<string, string>? args = null, string? coalesceKey = null, CancellationToken ct = default)
    {
        try
        {
            var user = await db.Users.AsNoTracking().Where(u => u.Id == userId)
                .Select(u => new { u.Email, u.EmailNotifications }).FirstOrDefaultAsync(ct);
            if (user is null) return;

            var n = coalesceKey is null ? null
                : await db.Notifications.FirstOrDefaultAsync(x => x.UserId == userId && x.CoalesceKey == coalesceKey && x.ReadAt == null, ct);
            var isNew = n is null;
            if (n is null) db.Notifications.Add(n = new Notification { UserId = userId, Type = type, CoalesceKey = coalesceKey });
            n.Title = title; n.Body = body; n.Link = link; n.CreatedAt = DateTime.UtcNow;
            n.ParamsJson = System.Text.Json.JsonSerializer.Serialize(args ?? []);
            await db.SaveChangesAsync(ct);

            // live: the bell and inbox update at once
            var unread = await db.Notifications.CountAsync(x => x.UserId == userId && x.ReadAt == null, ct);
            await realtime.ToUser(userId, RealtimeEvents.Notification, new { notification = NotificationMap.ToDto(n), unread });

            // one email per new notification: a busy chat does not send an email per message
            if (isNew && user.EmailNotifications) emails.Enqueue(new EmailMessage(user.Email, Texts.Fill(title, args), Texts.Fill(body, args), link)); // emails are English for now
        }
        catch (Exception e) { log.LogWarning(e, "Could not send notification to {UserId}", userId); }
    }
}

// ---------- the user's inbox ----------
public static class NotificationMap
{
    public static NotificationDto ToDto(Notification n)
    {
        var args = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(n.ParamsJson) ?? [];
        return new NotificationDto(n.Id, n.Type.ToString(), Texts.Fill(n.Title, args), Texts.Fill(n.Body, args), n.Title, n.Body, args, n.Link, n.ReadAt != null, n.CreatedAt);
    }
}

public record NotificationDto(Guid Id, string Type, string Title, string Body, string TitleTemplate, string BodyTemplate,
    Dictionary<string, string> Args, string Link, bool Read, DateTime CreatedAt);
public record InboxDto(int Unread, List<NotificationDto> Items);

public record GetInboxQuery(Guid UserId) : IQuery<InboxDto>;

public class GetInboxHandler(IAppDb db) : IQueryHandler<GetInboxQuery, InboxDto>
{
    public async Task<InboxDto> Handle(GetInboxQuery q, CancellationToken ct)
    {
        var rows = await db.Notifications.AsNoTracking().Where(n => n.UserId == q.UserId)
            .OrderByDescending(n => n.CreatedAt).Take(50).ToListAsync(ct);
        var items = rows.Select(NotificationMap.ToDto).ToList();
        var unread = await db.Notifications.CountAsync(n => n.UserId == q.UserId && n.ReadAt == null, ct);
        return new InboxDto(unread, items);
    }
}

public record GetUnreadCountQuery(Guid UserId) : IQuery<int>;

public class GetUnreadCountHandler(IAppDb db) : IQueryHandler<GetUnreadCountQuery, int>
{
    public Task<int> Handle(GetUnreadCountQuery q, CancellationToken ct) =>
        db.Notifications.CountAsync(n => n.UserId == q.UserId && n.ReadAt == null, ct);
}

/// <summary>Marks one notification read, or all of the user's when Id is null.</summary>
public record MarkReadCommand(Guid UserId, Guid? Id) : ICommand<bool>;

public class MarkReadHandler(IAppDb db) : ICommandHandler<MarkReadCommand, bool>
{
    public async Task<bool> Handle(MarkReadCommand c, CancellationToken ct)
    {
        var list = await db.Notifications.Where(n => n.UserId == c.UserId && n.ReadAt == null && (c.Id == null || n.Id == c.Id)).ToListAsync(ct);
        foreach (var n in list) n.ReadAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return true;
    }
}

// ---------- email on/off ----------
public record GetEmailPrefQuery(Guid UserId) : IQuery<bool>;

public class GetEmailPrefHandler(IAppDb db) : IQueryHandler<GetEmailPrefQuery, bool>
{
    public async Task<bool> Handle(GetEmailPrefQuery q, CancellationToken ct) =>
        await db.Users.AsNoTracking().Where(u => u.Id == q.UserId).Select(u => u.EmailNotifications).FirstOrDefaultAsync(ct);
}

public record SetEmailPrefCommand(Guid UserId, bool Enabled) : ICommand<bool>;

public class SetEmailPrefHandler(IAppDb db) : ICommandHandler<SetEmailPrefCommand, bool>
{
    public async Task<bool> Handle(SetEmailPrefCommand c, CancellationToken ct)
    {
        var u = await db.Users.FindAsync([c.UserId], ct) ?? throw new DomainException("User not found.");
        u.EmailNotifications = c.Enabled;
        await db.SaveChangesAsync(ct);
        return c.Enabled;
    }
}
