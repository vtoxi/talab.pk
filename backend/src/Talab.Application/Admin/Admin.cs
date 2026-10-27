using Microsoft.EntityFrameworkCore;
using Talab.Application.Realtime;
using Talab.Domain.Entities;

namespace Talab.Application.Admin;

// ---- Stats ----
public record AdminStats(int Users, int Owners, int VerifiedOwners, int OpenRequests, int Offers);
public record GetAdminStatsQuery : IQuery<AdminStats>;

public class GetAdminStatsHandler(IAppDb db) : IQueryHandler<GetAdminStatsQuery, AdminStats>
{
    public async Task<AdminStats> Handle(GetAdminStatsQuery q, CancellationToken ct) => new(
        await db.Users.CountAsync(ct),
        await db.Users.CountAsync(u => u.Role == Role.Owner, ct),
        await db.Users.CountAsync(u => u.Role == Role.Owner && u.Verified, ct),
        await db.Requests.CountAsync(r => r.Status == RequestStatus.Open, ct),
        await db.Offers.CountAsync(ct));
}

// ---- Requests ----
public record AdminRequest(Guid Id, Guid TenantId, string Category, decimal BudgetMin, decimal BudgetMax, DateOnly MoveIn, string Status, DateTime ExpiresAt, string Details);
public record ListAllRequestsQuery(RequestStatus? Status = null, int Page = 1, int PageSize = 25) : IQuery<List<AdminRequest>>;

public class ListAllRequestsHandler(IAppDb db) : IQueryHandler<ListAllRequestsQuery, List<AdminRequest>>
{
    public Task<List<AdminRequest>> Handle(ListAllRequestsQuery q, CancellationToken ct) =>
        db.Requests.AsNoTracking()
            .Where(r => q.Status == null || r.Status == q.Status)
            .OrderByDescending(r => r.ExpiresAt)
            .Skip((q.Page - 1) * q.PageSize).Take(q.PageSize)
            .Select(r => new AdminRequest(r.Id, r.TenantId, r.Category, r.BudgetMin, r.BudgetMax, r.MoveIn, r.Status.ToString(), r.ExpiresAt, r.Details))
            .ToListAsync(ct);
}

public record CloseRequestCommand(Guid Id) : ICommand<bool>;

public class CloseRequestHandler(IAppDb db, IRealtime realtime) : ICommandHandler<CloseRequestCommand, bool>
{
    public async Task<bool> Handle(CloseRequestCommand c, CancellationToken ct)
    {
        var r = await db.Requests.FindAsync([c.Id], ct) ?? throw new DomainException("Request not found.");
        r.Status = RequestStatus.Expired;
        await db.SaveChangesAsync(ct);
        await realtime.ToGroup(RealtimeGroups.Owners, RealtimeEvents.Refresh, new { scope = "feed" });
        await realtime.ToUser(r.TenantId, RealtimeEvents.Refresh, new { scope = "my-request" });
        await realtime.ToGroup(RealtimeGroups.Admins, RealtimeEvents.Admin, new { kind = "request" });
        return true;
    }
}

// ---- Users ----
public record AdminUser(Guid Id, string Name, string Email, string Role, bool Verified, string? City);
public record ListUsersQuery(Role? Role = null, int Page = 1, int PageSize = 25) : IQuery<List<AdminUser>>;

public class ListUsersHandler(IAppDb db) : IQueryHandler<ListUsersQuery, List<AdminUser>>
{
    public Task<List<AdminUser>> Handle(ListUsersQuery q, CancellationToken ct) =>
        db.Users.AsNoTracking()
            .Where(u => q.Role == null || u.Role == q.Role)
            .OrderBy(u => u.Name)
            .Skip((q.Page - 1) * q.PageSize).Take(q.PageSize)
            .Select(u => new AdminUser(u.Id, u.Name, u.Email, u.Role.ToString(), u.Verified, u.City))
            .ToListAsync(ct);
}

public record SetUserVerifiedCommand(Guid UserId, bool Verified) : ICommand<bool>;

public class SetUserVerifiedHandler(IAppDb db, IRealtime realtime) : ICommandHandler<SetUserVerifiedCommand, bool>
{
    public async Task<bool> Handle(SetUserVerifiedCommand c, CancellationToken ct)
    {
        var u = await db.Users.FindAsync([c.UserId], ct) ?? throw new DomainException("User not found.");
        u.Verified = c.Verified;
        await db.SaveChangesAsync(ct);
        await realtime.ToUser(u.Id, RealtimeEvents.Refresh, new { scope = "verification" });
        return true;
    }
}

// ---- Feature flags ----
public record ListFlagsQuery : IQuery<List<FeatureFlag>>;

public class ListFlagsHandler(IAppDb db) : IQueryHandler<ListFlagsQuery, List<FeatureFlag>>
{
    public Task<List<FeatureFlag>> Handle(ListFlagsQuery q, CancellationToken ct) =>
        db.FeatureFlags.AsNoTracking().OrderBy(f => f.Key).ToListAsync(ct);
}

public record SetFlagCommand(string Key, bool Enabled) : ICommand<bool>;

public class SetFlagHandler(IAppDb db) : ICommandHandler<SetFlagCommand, bool>
{
    public async Task<bool> Handle(SetFlagCommand c, CancellationToken ct)
    {
        var f = await db.FeatureFlags.FindAsync([c.Key], ct) ?? throw new DomainException("Unknown flag.");
        f.Enabled = c.Enabled;
        await db.SaveChangesAsync(ct);
        return true;
    }
}

// ---- Ad Limit Requests ----
public record AdminLimitRequestDto(Guid RequestId, Guid UserId, string UserName, string UserEmail, string Status, bool IsAutoApproved, DateTime CreatedAt);
public record ListAdminLimitRequestsQuery : IQuery<List<AdminLimitRequestDto>>;

public class ListAdminLimitRequestsHandler(IAppDb db) : IQueryHandler<ListAdminLimitRequestsQuery, List<AdminLimitRequestDto>>
{
    public async Task<List<AdminLimitRequestDto>> Handle(ListAdminLimitRequestsQuery q, CancellationToken ct)
    {
        var notes = await db.Notifications.AsNoTracking()
            .Where(n => n.CoalesceKey != null && n.CoalesceKey.StartsWith("limit_req:") && n.Body == "PendingAdmin")
            .OrderByDescending(n => n.CreatedAt)
            .Take(50)
            .ToListAsync(ct);

        var list = new List<AdminLimitRequestDto>();
        foreach (var n in notes)
        {
            var reqId = Guid.Empty;
            if (Guid.TryParse(n.CoalesceKey!.Replace("limit_req:", ""), out var parsed)) reqId = parsed;

            string userName = "Tenant";
            string userEmail = "";
            bool isAuto = false;

            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(n.ParamsJson);
                if (doc.RootElement.TryGetProperty("userName", out var un)) userName = un.GetString() ?? userName;
                if (doc.RootElement.TryGetProperty("userEmail", out var ue)) userEmail = ue.GetString() ?? userEmail;
                if (doc.RootElement.TryGetProperty("isAutoApproved", out var ia)) isAuto = ia.GetBoolean();
            }
            catch { }

            list.Add(new AdminLimitRequestDto(reqId, n.UserId, userName, userEmail, n.Body, isAuto, n.CreatedAt));
        }

        return list;
    }
}

public record DecideAdminLimitRequestCommand(Guid RequestId, bool Approve) : ICommand<bool>;

public class DecideAdminLimitRequestHandler(IAppDb db, IRealtime realtime) : ICommandHandler<DecideAdminLimitRequestCommand, bool>
{
    public async Task<bool> Handle(DecideAdminLimitRequestCommand c, CancellationToken ct)
    {
        var key = $"limit_req:{c.RequestId}";
        var note = await db.Notifications.FirstOrDefaultAsync(n => n.CoalesceKey == key, ct)
                   ?? throw new DomainException("Limit request not found.");

        note.Body = c.Approve ? "Approved" : "Rejected";
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(note.ParamsJson);
            var dict = new Dictionary<string, object>();
            foreach (var p in doc.RootElement.EnumerateObject())
            {
                if (p.Value.ValueKind == System.Text.Json.JsonValueKind.True || p.Value.ValueKind == System.Text.Json.JsonValueKind.False) dict[p.Name] = p.Value.GetBoolean();
                else if (p.Value.ValueKind == System.Text.Json.JsonValueKind.Number) dict[p.Name] = p.Value.GetInt64();
                else dict[p.Name] = p.Value.GetString() ?? "";
            }
            dict["status"] = note.Body;
            dict["decidedAt"] = DateTime.UtcNow.ToString("o");
            note.ParamsJson = System.Text.Json.JsonSerializer.Serialize(dict);
        }
        catch { }

        await db.SaveChangesAsync(ct);
        await realtime.ToUser(note.UserId, RealtimeEvents.Refresh, new { scope = "limit" });
        await realtime.ToGroup(RealtimeGroups.Admins, RealtimeEvents.Admin, new { kind = "limit_request" });
        return true;
    }
}
