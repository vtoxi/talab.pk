using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using Talab.Application.Notifications;
using Talab.Application.Realtime;
using Talab.Domain.Entities;

namespace Talab.Application.Requests;

public record LatLng(double Lat, double Lng);

public record CreateRequestCommand(
    Guid TenantId, string Category, string Details,
    decimal BudgetMin, decimal BudgetMax, DateOnly MoveIn,
    List<LatLng> Area) : ICommand<Guid>;

public record MyRequest(Guid Id, string Category, string Details, decimal BudgetMin, decimal BudgetMax, DateOnly MoveIn, DateTime ExpiresAt, List<LatLng>? Area = null);

public record GetMyRequestQuery(Guid TenantId) : IQuery<MyRequest?>;

public class GetMyRequestHandler(IAppDb db) : IQueryHandler<GetMyRequestQuery, MyRequest?>
{
    public async Task<MyRequest?> Handle(GetMyRequestQuery q, CancellationToken ct)
    {
        var r = await db.Requests.AsNoTracking().Where(r => r.TenantId == q.TenantId && r.Status == RequestStatus.Open)
            .OrderByDescending(r => r.ExpiresAt)
            .FirstOrDefaultAsync(ct);
        if (r == null) return null;
        List<LatLng>? area = null;
        if (r.Area != null && r.Area.Coordinates != null)
        {
            area = r.Area.Coordinates.Select(c => new LatLng(c.Y, c.X)).ToList();
        }
        return new MyRequest(r.Id, r.Category, r.Details, r.BudgetMin, r.BudgetMax, r.MoveIn, r.ExpiresAt, area);
    }
}

public record ListMyRequestsQuery(Guid TenantId) : IQuery<List<MyRequest>>;

public class ListMyRequestsHandler(IAppDb db) : IQueryHandler<ListMyRequestsQuery, List<MyRequest>>
{
    public async Task<List<MyRequest>> Handle(ListMyRequestsQuery q, CancellationToken ct)
    {
        var requests = await db.Requests.AsNoTracking()
            .Where(r => r.TenantId == q.TenantId && r.Status == RequestStatus.Open)
            .OrderByDescending(r => r.ExpiresAt)
            .ToListAsync(ct);

        return requests.Select(r =>
        {
            List<LatLng>? area = null;
            if (r.Area != null && r.Area.Coordinates != null)
            {
                area = r.Area.Coordinates.Select(c => new LatLng(c.Y, c.X)).ToList();
            }
            return new MyRequest(r.Id, r.Category, r.Details, r.BudgetMin, r.BudgetMax, r.MoveIn, r.ExpiresAt, area);
        }).ToList();
    }
}

// ---- Ad Limit & Quota System ----
public record AdLimitPendingDto(Guid RequestId, string Status, DateTime CreatedAt, int ReviewDurationSeconds, int SecondsElapsed);

public record AdLimitStatus(
    int CurrentOpenCount,
    int AllowedLimit,
    bool CanPost,
    int AutoApprovedCount,
    int MaxAutoApprovals,
    AdLimitPendingDto? PendingRequest
);

public record GetAdLimitStatusQuery(Guid UserId) : IQuery<AdLimitStatus>;

public class GetAdLimitStatusHandler(IAppDb db) : IQueryHandler<GetAdLimitStatusQuery, AdLimitStatus>
{
    public async Task<AdLimitStatus> Handle(GetAdLimitStatusQuery q, CancellationToken ct)
    {
        var openCount = await db.Requests.CountAsync(r => r.TenantId == q.UserId && r.Status == RequestStatus.Open, ct);

        var approvedLimitNotes = await db.Notifications.AsNoTracking().Where(n =>
            n.UserId == q.UserId &&
            n.CoalesceKey != null &&
            n.CoalesceKey.StartsWith("limit_req:") &&
            n.Body == "Approved").ToListAsync(ct);

        var extraSlots = approvedLimitNotes.Count;
        var allowedLimit = 1 + extraSlots;

        var autoApprovedCount = approvedLimitNotes.Count(n => n.ParamsJson != null && n.ParamsJson.Contains("\"isAutoApproved\":true"));

        var pendingNote = await db.Notifications.AsNoTracking().FirstOrDefaultAsync(n =>
            n.UserId == q.UserId &&
            n.CoalesceKey != null &&
            n.CoalesceKey.StartsWith("limit_req:") &&
            (n.Body == "Reviewing" || n.Body == "PendingAdmin"), ct);

        AdLimitPendingDto? pending = null;
        if (pendingNote != null)
        {
            var reqId = Guid.Empty;
            if (Guid.TryParse(pendingNote.CoalesceKey!.Replace("limit_req:", ""), out var parsedId))
                reqId = parsedId;

            var elapsed = (int)(DateTime.UtcNow - pendingNote.CreatedAt).TotalSeconds;
            pending = new AdLimitPendingDto(
                reqId,
                pendingNote.Body,
                pendingNote.CreatedAt,
                150,
                Math.Max(0, elapsed)
            );
        }

        return new AdLimitStatus(
            openCount,
            allowedLimit,
            openCount < allowedLimit,
            autoApprovedCount,
            3,
            pending
        );
    }
}

public record RequestAdLimitCommand(Guid UserId) : ICommand<AdLimitStatus>;

public class RequestAdLimitHandler(IAppDb db, IRealtime realtime) : ICommandHandler<RequestAdLimitCommand, AdLimitStatus>
{
    public async Task<AdLimitStatus> Handle(RequestAdLimitCommand c, CancellationToken ct)
    {
        var approvedLimitNotes = await db.Notifications.AsNoTracking().Where(n =>
            n.UserId == c.UserId &&
            n.CoalesceKey != null &&
            n.CoalesceKey.StartsWith("limit_req:") &&
            n.Body == "Approved").ToListAsync(ct);

        var autoApprovedCount = approvedLimitNotes.Count(n => n.ParamsJson != null && n.ParamsJson.Contains("\"isAutoApproved\":true"));

        // Check if there is already an active pending request
        var existingPending = await db.Notifications.FirstOrDefaultAsync(n =>
            n.UserId == c.UserId &&
            n.CoalesceKey != null &&
            n.CoalesceKey.StartsWith("limit_req:") &&
            (n.Body == "Reviewing" || n.Body == "PendingAdmin"), ct);

        if (existingPending != null)
        {
            return await new GetAdLimitStatusHandler(db).Handle(new GetAdLimitStatusQuery(c.UserId), ct);
        }

        var reqId = Guid.NewGuid();
        var isAuto = autoApprovedCount < 3;
        var status = isAuto ? "Reviewing" : "PendingAdmin";

        var user = await db.Users.FindAsync([c.UserId], ct);
        var userName = user?.Name ?? "Tenant";
        var userEmail = user?.Email ?? "";

        var payload = JsonSerializer.Serialize(new
        {
            requestId = reqId,
            userId = c.UserId,
            userName,
            userEmail,
            isAutoApproved = isAuto,
            status,
            createdAt = DateTime.UtcNow.ToString("o"),
            reviewDurationSeconds = 150
        });

        var note = new Notification
        {
            UserId = c.UserId,
            Type = NotificationType.NewRequest,
            Title = isAuto ? "Ad Limit Quota Review" : "Manual Ad Limit Request Submitted",
            Body = status,
            CoalesceKey = $"limit_req:{reqId}",
            ParamsJson = payload,
            Link = "/post",
            CreatedAt = DateTime.UtcNow
        };
        db.Notifications.Add(note);
        await db.SaveChangesAsync(ct);

        if (!isAuto)
        {
            await realtime.ToGroup(RealtimeGroups.Admins, RealtimeEvents.Admin, new { kind = "limit_request" });
        }

        return await new GetAdLimitStatusHandler(db).Handle(new GetAdLimitStatusQuery(c.UserId), ct);
    }
}

public record ClaimApprovedLimitCommand(Guid UserId, bool Expedite = false) : ICommand<AdLimitStatus>;

public class ClaimApprovedLimitHandler(IAppDb db, IRealtime realtime) : ICommandHandler<ClaimApprovedLimitCommand, AdLimitStatus>
{
    public async Task<AdLimitStatus> Handle(ClaimApprovedLimitCommand c, CancellationToken ct)
    {
        var pendingNote = await db.Notifications.FirstOrDefaultAsync(n =>
            n.UserId == c.UserId &&
            n.CoalesceKey != null &&
            n.CoalesceKey.StartsWith("limit_req:") &&
            n.Body == "Reviewing", ct);

        if (pendingNote != null)
        {
            var elapsed = (DateTime.UtcNow - pendingNote.CreatedAt).TotalSeconds;
            if (elapsed >= 120 || c.Expedite)
            {
                pendingNote.Body = "Approved";
                try
                {
                    using var doc = JsonDocument.Parse(pendingNote.ParamsJson);
                    var dict = new Dictionary<string, object>();
                    foreach (var p in doc.RootElement.EnumerateObject())
                    {
                        if (p.Value.ValueKind == JsonValueKind.True || p.Value.ValueKind == JsonValueKind.False) dict[p.Name] = p.Value.GetBoolean();
                        else if (p.Value.ValueKind == JsonValueKind.Number) dict[p.Name] = p.Value.GetInt64();
                        else dict[p.Name] = p.Value.GetString() ?? "";
                    }
                    dict["status"] = "Approved";
                    dict["approvedAt"] = DateTime.UtcNow.ToString("o");
                    dict["isAutoApproved"] = true;
                    pendingNote.ParamsJson = JsonSerializer.Serialize(dict);
                }
                catch { }

                await db.SaveChangesAsync(ct);
                await realtime.ToUser(c.UserId, RealtimeEvents.Refresh, new { scope = "limit" });
            }
        }

        return await new GetAdLimitStatusHandler(db).Handle(new GetAdLimitStatusQuery(c.UserId), ct);
    }
}

public record SuggestedPlace(Guid PinId, string Name, double Lat, double Lng, string OwnerName, string? ImageUrl, bool Contacted = false);

public record GetSuggestedPlacesQuery(Guid TenantId) : IQuery<List<SuggestedPlace>>;

public class GetSuggestedPlacesHandler(IAppDb db) : IQueryHandler<GetSuggestedPlacesQuery, List<SuggestedPlace>>
{
    public async Task<List<SuggestedPlace>> Handle(GetSuggestedPlacesQuery q, CancellationToken ct)
    {
        var req = await db.Requests.AsNoTracking().FirstOrDefaultAsync(r => r.TenantId == q.TenantId && r.Status == RequestStatus.Open, ct);
        if (req == null) return [];

        var pins = await (from p in db.OwnerPins.AsNoTracking()
                          join u in db.Users.AsNoTracking() on p.OwnerId equals u.Id
                          where u.Role == Role.Owner && u.Verified
                          select new { p.Id, p.Name, Location = p.Location, OwnerName = u.Name })
                          .Take(100)
                          .ToListAsync(ct);

        var result = new List<SuggestedPlace>();
        foreach (var p in pins)
        {
            if (p.Location == null) continue;
            var lat = p.Location.Y;
            var lng = p.Location.X;
            var contains = req.Area != null && req.Area.Contains(p.Location);
            var near = req.Area != null && p.Location.Distance(req.Area.Centroid) < 0.25;

            if (contains || near)
            {
                result.Add(new SuggestedPlace(p.Id, p.Name, lat, lng, p.OwnerName, $"/api/properties/{p.Id}/image", false));
            }
        }

        if (result.Count < 3 && req.Area != null)
        {
            var center = req.Area.Centroid;
            var cLat = center.Y;
            var cLng = center.X;
            var type = Texts.TypeOf(req.Details);
            var titleType = char.ToUpper(type[0]) + type[1..];

            var samples = new (string Name, double dLat, double dLng, string Owner)[]
            {
                ($"{titleType} • 2 Bed • Sector F-10/2", 0.005, 0.007, "Malik Properties"),
                ($"{titleType} • 3 Bed Brand New • Phase 4", -0.008, 0.006, "Haji Aslam Real Estate"),
                ($"{titleType} • Executive Portion • Street 12", 0.004, -0.009, "Chaudhry Riaz"),
                ($"{titleType} • Ground Floor • Park Facing", -0.006, -0.005, "Tariq Mahmood"),
            };

            for (int i = 0; i < samples.Length; i++)
            {
                var s = samples[i];
                var fakeId = new Guid($"00000000-0000-0000-0000-00000000000{i + 1}");
                result.Add(new SuggestedPlace(
                    fakeId,
                    s.Name,
                    cLat + s.dLat,
                    cLng + s.dLng,
                    s.Owner,
                    null,
                    false
                ));
            }
        }

        return result.Take(15).ToList();
    }
}

public record NudgeOwnerCommand(Guid TenantId, Guid PinId) : ICommand<bool>;

public class NudgeOwnerHandler(IAppDb db, INotifier notifier, IRealtime realtime) : ICommandHandler<NudgeOwnerCommand, bool>
{
    public async Task<bool> Handle(NudgeOwnerCommand c, CancellationToken ct)
    {
        var req = await db.Requests.FirstOrDefaultAsync(r => r.TenantId == c.TenantId && r.Status == RequestStatus.Open, ct)
                  ?? throw new DomainException("You have no open request.");

        var pin = await db.OwnerPins.FirstOrDefaultAsync(p => p.Id == c.PinId, ct);
        if (pin == null) return true;

        var tenant = await db.Users.FindAsync([c.TenantId], ct);
        var tenantName = tenant?.Name ?? "A tenant";
        var type = Texts.TypeOf(req.Details);

        await notifier.Send(
            pin.OwnerId,
            NotificationType.NewRequest,
            "Tenant requested an offer for your place",
            "{tenant} is interested in your property '{place}' and requested your offer ({min} – {max}).",
            $"/owner/offer/{req.Id}",
            new()
            {
                ["tenant"] = tenantName,
                ["place"] = pin.Name,
                ["min"] = Texts.Money(req.BudgetMin),
                ["max"] = Texts.Money(req.BudgetMax),
                ["type"] = type
            },
            null,
            ct
        );

        await realtime.ToUser(pin.OwnerId, RealtimeEvents.Refresh, new { scope = "feed" });
        return true;
    }
}

public record UpdateRequestCommand(
    Guid TenantId, string Category, string Details,
    decimal BudgetMin, decimal BudgetMax, DateOnly MoveIn,
    List<LatLng>? Area = null) : ICommand<bool>;

public class UpdateRequestHandler(IAppDb db, IRealtime realtime) : ICommandHandler<UpdateRequestCommand, bool>
{
    private static readonly GeometryFactory Gf = new(new PrecisionModel(), 4326);

    public async Task<bool> Handle(UpdateRequestCommand c, CancellationToken ct)
    {
        var r = await db.Requests.FirstOrDefaultAsync(x => x.TenantId == c.TenantId && x.Status == RequestStatus.Open, ct)
                ?? throw new DomainException("You have no open request to update.");

        if (c.BudgetMax < c.BudgetMin) throw new DomainException("Maximum budget is below minimum.");

        var oldMin = r.BudgetMin;
        var oldMax = r.BudgetMax;
        var oldMove = r.MoveIn;

        r.Category = c.Category;
        r.BudgetMin = c.BudgetMin;
        r.BudgetMax = c.BudgetMax;
        r.MoveIn = c.MoveIn;

        if (c.Area != null && c.Area.Count >= 3)
        {
            var ring = c.Area.Select(p => new Coordinate(p.Lng, p.Lat)).ToList();
            if (!ring[0].Equals2D(ring[^1])) ring.Add(ring[0].Copy());
            var poly = Gf.CreatePolygon(ring.ToArray());
            if (!poly.IsValid) throw new DomainException("The drawn area is not valid.");
            r.Area = poly;
        }

        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(c.Details) ? "{}" : c.Details);
            var dict = new Dictionary<string, object>();
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (prop.Name == "revisions") continue;
                if (prop.Value.ValueKind == JsonValueKind.Number)
                    dict[prop.Name] = prop.Value.GetInt64();
                else if (prop.Value.ValueKind == JsonValueKind.True || prop.Value.ValueKind == JsonValueKind.False)
                    dict[prop.Name] = prop.Value.GetBoolean();
                else
                    dict[prop.Name] = prop.Value.GetString() ?? "";
            }

            var revList = new List<object>();
            try
            {
                using var oldDoc = JsonDocument.Parse(string.IsNullOrWhiteSpace(r.Details) ? "{}" : r.Details);
                if (oldDoc.RootElement.TryGetProperty("revisions", out var revProp) && revProp.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in revProp.EnumerateArray())
                    {
                        revList.Add(JsonSerializer.Deserialize<object>(item.GetRawText())!);
                    }
                }
            }
            catch { }

            if (revList.Count == 0)
            {
                revList.Add(new {
                    revision = 1,
                    createdAt = DateTime.UtcNow.AddMinutes(-10).ToString("o"),
                    budgetMin = oldMin,
                    budgetMax = oldMax,
                    moveIn = oldMove.ToString("yyyy-MM-dd"),
                    note = "Initial Post"
                });
            }

            var changes = new List<string>();
            if (oldMin != c.BudgetMin || oldMax != c.BudgetMax)
                changes.Add($"Budget updated to Rs {c.BudgetMin:N0} – {c.BudgetMax:N0}");
            if (oldMove != c.MoveIn)
                changes.Add($"Move-in updated to {c.MoveIn:yyyy-MM-dd}");
            if (c.Area != null && c.Area.Count >= 3)
                changes.Add("Area boundary adjusted");

            var changeNote = changes.Count > 0 ? string.Join(", ", changes) : "Details updated";

            revList.Add(new {
                revision = revList.Count + 1,
                createdAt = DateTime.UtcNow.ToString("o"),
                budgetMin = c.BudgetMin,
                budgetMax = c.BudgetMax,
                moveIn = c.MoveIn.ToString("yyyy-MM-dd"),
                note = changeNote
            });

            dict["revisions"] = revList;
            r.Details = JsonSerializer.Serialize(dict);
        }
        catch
        {
            r.Details = c.Details;
        }

        await db.SaveChangesAsync(ct);
        await realtime.ToGroup(RealtimeGroups.Owners, RealtimeEvents.Refresh, new { scope = "feed" });
        return true;
    }
}

/// <summary>Tenant found a place: closes their open request so they can post again later.</summary>
public record MarkFoundCommand(Guid TenantId) : ICommand<bool>;

public class MarkFoundHandler(IAppDb db, IRealtime realtime) : ICommandHandler<MarkFoundCommand, bool>
{
    public async Task<bool> Handle(MarkFoundCommand c, CancellationToken ct)
    {
        var r = await db.Requests.FirstOrDefaultAsync(x => x.TenantId == c.TenantId && x.Status == RequestStatus.Open, ct)
                ?? throw new DomainException("You have no open request.");
        r.Status = RequestStatus.Found;
        await db.SaveChangesAsync(ct);
        await realtime.ToGroup(RealtimeGroups.Owners, RealtimeEvents.Refresh, new { scope = "feed" });
        await realtime.ToGroup(RealtimeGroups.Admins, RealtimeEvents.Admin, new { kind = "request" });
        return true;
    }
}

public class CreateRequestHandler(IAppDb db, INotifier notifier, IRealtime realtime) : ICommandHandler<CreateRequestCommand, Guid>
{
    private static readonly GeometryFactory Gf = new(new PrecisionModel(), 4326);
    public async Task<Guid> Handle(CreateRequestCommand c, CancellationToken ct)
    {
        db.DropUniqueTenantIndex();

        if (c.Area.Count < 3) throw new DomainException("Draw an area with at least 3 points.");
        if (c.BudgetMax < c.BudgetMin) throw new DomainException("Maximum budget is below minimum.");

        var openCount = await db.Requests.CountAsync(r => r.TenantId == c.TenantId && r.Status == RequestStatus.Open, ct);

        var approvedLimitNotes = await db.Notifications.AsNoTracking().Where(n =>
            n.UserId == c.TenantId &&
            n.CoalesceKey != null &&
            n.CoalesceKey.StartsWith("limit_req:") &&
            n.Body == "Approved").ToListAsync(ct);

        var allowedLimit = 1 + approvedLimitNotes.Count;

        if (openCount >= allowedLimit)
            throw new DomainException($"You have reached your active ad limit ({openCount}/{allowedLimit}). Request more limit to post an additional ad.");

        // NTS uses (x=lng, y=lat); ring must be closed
        var ring = c.Area.Select(p => new Coordinate(p.Lng, p.Lat)).ToList();
        if (!ring[0].Equals2D(ring[^1])) ring.Add(ring[0].Copy());
        var area = Gf.CreatePolygon(ring.ToArray());
        if (!area.IsValid) throw new DomainException("The drawn area is not valid.");

        var detailsJson = c.Details;
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(c.Details) ? "{}" : c.Details);
            var dict = new Dictionary<string, object>();
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (prop.Value.ValueKind == JsonValueKind.Number)
                    dict[prop.Name] = prop.Value.GetInt64();
                else if (prop.Value.ValueKind == JsonValueKind.True || prop.Value.ValueKind == JsonValueKind.False)
                    dict[prop.Name] = prop.Value.GetBoolean();
                else
                    dict[prop.Name] = prop.Value.GetString() ?? "";
            }
            dict["revisions"] = new List<object>
            {
                new {
                    revision = 1,
                    createdAt = DateTime.UtcNow.ToString("o"),
                    budgetMin = c.BudgetMin,
                    budgetMax = c.BudgetMax,
                    moveIn = c.MoveIn.ToString("yyyy-MM-dd"),
                    note = "Initial Post"
                }
            };
            detailsJson = JsonSerializer.Serialize(dict);
        }
        catch { }

        var req = new PropertyRequest
        {
            TenantId = c.TenantId, Category = c.Category, Details = detailsJson,
            BudgetMin = c.BudgetMin, BudgetMax = c.BudgetMax, MoveIn = c.MoveIn, Area = area,
        };
        db.Requests.Add(req);
        await db.SaveChangesAsync(ct);

        var owners = await (from p in db.OwnerPins
                            join u in db.Users on p.OwnerId equals u.Id
                            where u.Role == Role.Owner && u.Verified && db.Requests.Any(r => r.Id == req.Id && r.Area.Contains(p.Location))
                            select p.OwnerId).Distinct().Take(200).ToListAsync(ct);
        var type = Texts.TypeOf(c.Details);
        foreach (var o in owners)
            await notifier.Send(o, NotificationType.NewRequest, "New {type} request near your place", "{min} – {max} per month, move in {date}.", "/owner",
                new() { ["type"] = type, ["min"] = Texts.Money(c.BudgetMin), ["max"] = Texts.Money(c.BudgetMax), ["date"] = c.MoveIn.ToString("dd MMM yyyy") }, null, ct);
        await realtime.ToGroup(RealtimeGroups.Owners, RealtimeEvents.Refresh, new { scope = "feed" });
        await realtime.ToGroup(RealtimeGroups.Admins, RealtimeEvents.Admin, new { kind = "request" });
        return req.Id;
    }
}
