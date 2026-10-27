using Microsoft.EntityFrameworkCore;
using Talab.Application.Notifications;
using Talab.Application.Realtime;
using Talab.Domain.Entities;

namespace Talab.Application.Offers;

// ---------- shared ----------
public record OfferSummary(Guid Id, Guid RequestId, string OtherParty, decimal Rent, decimal Advance, DateOnly AvailableFrom,
    string? Note, string Status, DateTime CreatedAt, double Lat = 0, double Lng = 0, string? PlaceName = null);

static class OfferAccess
{
    /// <summary>Loads the offer if the user is its owner or the tenant of its request; otherwise "not found" (no existence leak).</summary>
    public static async Task<(Offer Offer, PropertyRequest Request)> Load(IAppDb db, Guid offerId, Guid userId, CancellationToken ct)
    {
        var offer = await db.Offers.FirstOrDefaultAsync(o => o.Id == offerId, ct) ?? throw new DomainException("Offer not found.");
        var req = await db.Requests.FirstAsync(r => r.Id == offer.RequestId, ct);
        if (userId != offer.OwnerId && userId != req.TenantId) throw new DomainException("Offer not found.");
        return (offer, req);
    }

    public static void RequirePending(Offer o)
    {
        if (o.Status != OfferStatus.Pending) throw new DomainException($"This offer is already {o.Status.ToString().ToLower()}.");
    }
}

/// <summary>Notifies the other side of an offer thread.</summary>
static class OfferNotify
{
    public static async Task ToOther(IAppDb db, INotifier n, Offer o, PropertyRequest r, Guid senderId, NotificationType type,
        string title, string body, Dictionary<string, string>? args, string? coalesce, CancellationToken ct)
    {
        var to = senderId == o.OwnerId ? r.TenantId : o.OwnerId;
        var name = await db.Users.AsNoTracking().Where(u => u.Id == senderId).Select(u => u.Name).FirstAsync(ct);
        await n.Send(to, type, title, body, $"/offers/{o.Id}", new(args ?? []) { ["name"] = name }, coalesce, ct);
    }
}

// ---------- owner sends an offer ----------
public record CreateOfferCommand(Guid OwnerId, Guid RequestId, decimal Rent, decimal Advance, DateOnly AvailableFrom, string? Note) : ICommand<Guid>;

public class CreateOfferHandler(IAppDb db, INotifier notifier) : ICommandHandler<CreateOfferCommand, Guid>
{
    public async Task<Guid> Handle(CreateOfferCommand c, CancellationToken ct)
    {
        var owner = await db.Users.FindAsync([c.OwnerId], ct) ?? throw new DomainException("User not found.");
        if (!owner.Verified) throw new DomainException("Verify your account first. Upload your CNIC from the Requests page; you can send offers once it is approved.");
        if (c.Rent <= 0) throw new DomainException("Enter the monthly rent.");
        if (c.Advance < 0) throw new DomainException("Advance cannot be negative.");
        if (c.Note?.Length > 1000) throw new DomainException("Note is too long.");

        if (!await db.Requests.AnyAsync(r => r.Id == c.RequestId && r.Status == RequestStatus.Open && r.ExpiresAt > DateTime.UtcNow, ct))
            throw new DomainException("This request is no longer open.");
        if (await db.Offers.AnyAsync(o => o.RequestId == c.RequestId && o.OwnerId == c.OwnerId, ct))
            throw new DomainException("You already sent an offer on this request.");

        // the offer's location is one of the owner's saved places inside the tenant's drawn area
        var pin = await db.OwnerPins.Where(p => p.OwnerId == c.OwnerId
                && db.Requests.Any(r => r.Id == c.RequestId && r.Area.Contains(p.Location))).FirstOrDefaultAsync(ct)
            ?? throw new DomainException("This request is not near any of your saved places.");

        var offer = new Offer { RequestId = c.RequestId, OwnerId = c.OwnerId, Location = pin.Location, Rent = c.Rent, Advance = c.Advance, AvailableFrom = c.AvailableFrom, Note = c.Note?.Trim() };
        db.Offers.Add(offer);
        await db.SaveChangesAsync(ct);

        var tenantId = await db.Requests.Where(r => r.Id == c.RequestId).Select(r => r.TenantId).FirstAsync(ct);
        await notifier.Send(tenantId, NotificationType.NewOffer, "New offer: {rent} per month", "{name} sent an offer on your request.",
            $"/offers/{offer.Id}", new() { ["rent"] = Texts.Money(c.Rent), ["name"] = owner.Name }, null, ct);
        return offer.Id;
    }
}

// ---------- lists ----------
public record ListTenantOffersQuery(Guid TenantId) : IQuery<List<OfferSummary>>;

public class ListTenantOffersHandler(IAppDb db) : IQueryHandler<ListTenantOffersQuery, List<OfferSummary>>
{
    public Task<List<OfferSummary>> Handle(ListTenantOffersQuery q, CancellationToken ct) =>
        (from o in db.Offers.AsNoTracking()
         join r in db.Requests on o.RequestId equals r.Id
         join u in db.Users on o.OwnerId equals u.Id
         where r.TenantId == q.TenantId && r.Status == RequestStatus.Open
         orderby o.CreatedAt descending
         select new OfferSummary(o.Id, o.RequestId, u.Name, o.Rent, o.Advance, o.AvailableFrom, o.Note, o.Status.ToString(), o.CreatedAt, o.Location.Y, o.Location.X, db.OwnerPins.Where(p => p.OwnerId == o.OwnerId && p.Location.Distance(o.Location) < 0.0001).Select(p => p.Name).FirstOrDefault()))
        .ToListAsync(ct);
}

public record ListOwnerOffersQuery(Guid OwnerId) : IQuery<List<OfferSummary>>;

public class ListOwnerOffersHandler(IAppDb db) : IQueryHandler<ListOwnerOffersQuery, List<OfferSummary>>
{
    public Task<List<OfferSummary>> Handle(ListOwnerOffersQuery q, CancellationToken ct) =>
        (from o in db.Offers.AsNoTracking()
         join r in db.Requests on o.RequestId equals r.Id
         join u in db.Users on r.TenantId equals u.Id
         where o.OwnerId == q.OwnerId
         orderby o.CreatedAt descending
         select new OfferSummary(o.Id, o.RequestId, u.Name, o.Rent, o.Advance, o.AvailableFrom, o.Note, o.Status.ToString(), o.CreatedAt, o.Location.Y, o.Location.X, db.OwnerPins.Where(p => p.OwnerId == o.OwnerId && p.Location.Distance(o.Location) < 0.0001).Select(p => p.Name).FirstOrDefault()))
        .Take(100).ToListAsync(ct);
}

// ---------- thread ----------
public record MessageDto(Guid Id, bool Mine, string Kind, string Text, decimal? Rent, decimal? Advance, DateTime At, bool Seen);
/// <summary>RequestDetails is the request's JSON (type etc.); PlaceName is the owner's saved place the offer is for.</summary>
public record ThreadDto(OfferSummary Offer, bool IsTenant, decimal BudgetMin, decimal BudgetMax, string RequestDetails, DateOnly RequestMoveIn,
    string? PlaceName, List<MessageDto> Messages);

public record GetThreadQuery(Guid UserId, Guid OfferId) : IQuery<ThreadDto>;

public class GetThreadHandler(IAppDb db, IRealtime realtime) : IQueryHandler<GetThreadQuery, ThreadDto>
{
    public async Task<ThreadDto> Handle(GetThreadQuery q, CancellationToken ct)
    {
        var (o, r) = await OfferAccess.Load(db, q.OfferId, q.UserId, ct);
        var isTenant = q.UserId == r.TenantId;
        var other = await db.Users.AsNoTracking().Where(u => u.Id == (isTenant ? o.OwnerId : r.TenantId)).Select(u => u.Name).FirstAsync(ct);
        // opening the chat counts as reading its notifications
        var link = $"/offers/{o.Id}";
        var unread = await db.Notifications.Where(n => n.UserId == q.UserId && n.Link == link && n.ReadAt == null).ToListAsync(ct);
        if (unread.Count > 0) { foreach (var n in unread) n.ReadAt = DateTime.UtcNow; await db.SaveChangesAsync(ct); }

        // opening the chat also marks the other side's messages as seen, and tells them live
        var unseen = await db.Messages.Where(m => m.OfferId == o.Id && m.SenderId != q.UserId && m.ReadAt == null).ToListAsync(ct);
        if (unseen.Count > 0)
        {
            foreach (var m in unseen) m.ReadAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await realtime.ToOffer(o.Id, RealtimeEvents.Seen, new { offerId = o.Id });
        }

        var msgs = await db.Messages.AsNoTracking().Where(m => m.OfferId == o.Id).OrderBy(m => m.CreatedAt).Take(500)
            .Select(m => new MessageDto(m.Id, m.SenderId == q.UserId, m.Kind.ToString(), m.Text, m.Rent, m.Advance, m.CreatedAt, m.ReadAt != null)).ToListAsync(ct);
        // the owner's saved place at the offer's location (within ~10 m), for the chat title
        var place = await db.OwnerPins.AsNoTracking()
            .Where(p => p.OwnerId == o.OwnerId && p.Location.Distance(o.Location) < 0.0001)
            .OrderBy(p => p.Location.Distance(o.Location)).Select(p => p.Name).FirstOrDefaultAsync(ct);

        return new ThreadDto(new OfferSummary(o.Id, o.RequestId, other, o.Rent, o.Advance, o.AvailableFrom, o.Note, o.Status.ToString(), o.CreatedAt, o.Location.Y, o.Location.X, place),
            isTenant, r.BudgetMin, r.BudgetMax, r.Details, r.MoveIn, place, msgs);
    }
}

// ---------- negotiate ----------
public record SendMessageCommand(Guid UserId, Guid OfferId, string Text) : ICommand<bool>;

public class SendMessageHandler(IAppDb db, INotifier notifier, IRealtime realtime) : ICommandHandler<SendMessageCommand, bool>
{
    public async Task<bool> Handle(SendMessageCommand c, CancellationToken ct)
    {
        var (o, req) = await OfferAccess.Load(db, c.OfferId, c.UserId, ct);
        if (o.Status is OfferStatus.Rejected or OfferStatus.Withdrawn) throw new DomainException("This offer is closed.");
        var text = c.Text?.Trim() ?? "";
        if (text.Length is 0 or > 1000) throw new DomainException("Write a message up to 1000 characters.");
        db.Messages.Add(new Message { OfferId = o.Id, SenderId = c.UserId, Kind = MessageKind.Text, Text = text });
        await db.SaveChangesAsync(ct);

        var preview = text.Length > 80 ? text[..80] + "…" : text;
        await OfferNotify.ToOther(db, notifier, o, req, c.UserId, NotificationType.NewMessage, "New message from {name}", "{preview}",
            new() { ["preview"] = preview }, $"msg:{o.Id}", ct);
        await realtime.ToOffer(o.Id, RealtimeEvents.Thread, new { offerId = o.Id });
        return true;
    }
}

/// <summary>A counter-proposal from either side. The latest counter becomes the offer's current terms.</summary>
public record CounterOfferCommand(Guid UserId, Guid OfferId, decimal Rent, decimal Advance) : ICommand<bool>;

public class CounterOfferHandler(IAppDb db, INotifier notifier, IRealtime realtime) : ICommandHandler<CounterOfferCommand, bool>
{
    public async Task<bool> Handle(CounterOfferCommand c, CancellationToken ct)
    {
        var (o, req) = await OfferAccess.Load(db, c.OfferId, c.UserId, ct);
        OfferAccess.RequirePending(o);
        if (c.Rent <= 0 || c.Advance < 0) throw new DomainException("Enter a valid rent and advance.");
        o.Rent = c.Rent; o.Advance = c.Advance;
        db.Messages.Add(new Message { OfferId = o.Id, SenderId = c.UserId, Kind = MessageKind.Counter, Text = "Proposed new terms", Rent = c.Rent, Advance = c.Advance });
        await db.SaveChangesAsync(ct);

        await OfferNotify.ToOther(db, notifier, o, req, c.UserId, NotificationType.OfferUpdate, "{name} suggested new terms",
            "Rent {rent} per month, advance {advance}.", new() { ["rent"] = Texts.Money(c.Rent), ["advance"] = Texts.Money(c.Advance) }, null, ct);
        await realtime.ToOffer(o.Id, RealtimeEvents.Thread, new { offerId = o.Id });
        return true;
    }
}

public enum OfferAction { Accept, Reject, Withdraw }

/// <summary>Tenant accepts or rejects; owner withdraws. Only a pending offer can change.</summary>
public record DecideOfferCommand(Guid UserId, Guid OfferId, OfferAction Action) : ICommand<bool>;

public class DecideOfferHandler(IAppDb db, INotifier notifier, IRealtime realtime) : ICommandHandler<DecideOfferCommand, bool>
{
    public async Task<bool> Handle(DecideOfferCommand c, CancellationToken ct)
    {
        var (o, r) = await OfferAccess.Load(db, c.OfferId, c.UserId, ct);
        OfferAccess.RequirePending(o);
        var isTenant = c.UserId == r.TenantId;

        o.Status = (c.Action, isTenant) switch
        {
            (OfferAction.Accept, true) => OfferStatus.Accepted,
            (OfferAction.Reject, true) => OfferStatus.Rejected,
            (OfferAction.Withdraw, false) => OfferStatus.Withdrawn,
            _ => throw new DomainException("You cannot do that on this offer."),
        };
        db.Messages.Add(new Message { OfferId = o.Id, SenderId = c.UserId, Kind = MessageKind.Text, Text = $"Offer {o.Status.ToString().ToLower()}." });
        await db.SaveChangesAsync(ct);

        var (title, body) = o.Status switch
        {
            OfferStatus.Accepted => ("Your offer was accepted", "{name} accepted your offer. You can now prepare the rental agreement."),
            OfferStatus.Rejected => ("Your offer was declined", "{name} declined your offer."),
            _ => ("An offer was withdrawn", "{name} withdrew their offer."),
        };
        await OfferNotify.ToOther(db, notifier, o, r, c.UserId, NotificationType.OfferUpdate, title, body, null, null, ct);
        await realtime.ToOffer(o.Id, RealtimeEvents.Thread, new { offerId = o.Id });
        return true;
    }
}
