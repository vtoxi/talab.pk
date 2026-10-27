using Microsoft.EntityFrameworkCore;

namespace Talab.Application.Realtime;

/// <summary>
/// Port for pushing live events to connected browsers. Implemented over SignalR in the API.
/// Pushing is best effort: it never throws, and every client also re-fetches on reconnect, so a missed push is only a delay.
/// </summary>
public interface IRealtime
{
    Task ToUser(Guid userId, string eventName, object payload);
    Task ToOffer(Guid offerId, string eventName, object payload);
    Task ToGroup(string group, string eventName, object payload);
}

public static class RealtimeGroups
{
    public static string User(Guid id) => $"user:{id}";
    public static string Offer(Guid id) => $"offer:{id}";
    public const string Admins = "admins";
    public const string Owners = "owners";
}

/// <summary>Event names the clients listen for.</summary>
public static class RealtimeEvents
{
    public const string Notification = "notification"; // to a user: new or updated notification + unread count
    public const string Thread = "thread";             // to an offer group: messages or terms changed, refetch
    public const string Seen = "seen";                 // to an offer group: the other side read the messages
    public const string Agreement = "agreement";       // to an offer group: agreement draft changed
    public const string Refresh = "refresh";           // to owners: their feed may have changed
    public const string Admin = "admin";               // to admins: queues changed
}

/// <summary>Is this user the tenant or the owner of the offer? Used to authorise joining a live chat.</summary>
public record CanAccessOfferQuery(Guid UserId, Guid OfferId) : IQuery<bool>;

public class CanAccessOfferHandler(IAppDb db) : IQueryHandler<CanAccessOfferQuery, bool>
{
    public Task<bool> Handle(CanAccessOfferQuery q, CancellationToken ct) =>
        (from o in db.Offers.AsNoTracking()
         join r in db.Requests on o.RequestId equals r.Id
         where o.Id == q.OfferId && (o.OwnerId == q.UserId || r.TenantId == q.UserId)
         select o.Id).AnyAsync(ct);
}
