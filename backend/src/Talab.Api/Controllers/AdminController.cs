using Microsoft.AspNetCore.Mvc;
using Talab.Api.Auth;
using Talab.Application;
using Talab.Application.Admin;
using Talab.Application.Verification;
using Talab.Domain.Entities;

namespace Talab.Api.Controllers;

public record RejectBody(string Reason);

[ApiController, Route("api/admin"), Microsoft.AspNetCore.Authorization.Authorize(Roles = "Admin")]
public class AdminController(IDispatcher bus) : ControllerBase
{
    [HttpGet("stats")] public Task<AdminStats> Stats(CancellationToken ct) => bus.Ask(new GetAdminStatsQuery(), ct);

    [HttpGet("requests")] public Task<List<AdminRequest>> Requests([FromQuery] ListAllRequestsQuery q, CancellationToken ct) => bus.Ask(q, ct);
    [HttpPost("requests/{id:guid}/close")] public Task<bool> Close(Guid id, CancellationToken ct) => bus.Send(new CloseRequestCommand(id), ct);

    [HttpGet("users")] public Task<List<AdminUser>> Users([FromQuery] ListUsersQuery q, CancellationToken ct) => bus.Ask(q, ct);
    [HttpPost("users/{id:guid}/verified")] public Task<bool> Verify(Guid id, [FromBody] bool verified, CancellationToken ct) => bus.Send(new SetUserVerifiedCommand(id, verified), ct);

    [HttpGet("verifications")]
    public Task<List<AdminVerification>> Verifications([FromQuery] ListVerificationsQuery q, CancellationToken ct) => bus.Ask(q, ct);

    [HttpGet("verifications/{id:guid}")]
    public Task<AdminVerification> Verification(Guid id, CancellationToken ct) => bus.Ask(new GetVerificationQuery(id), ct);

    [HttpGet("verifications/{id:guid}/image/{which}")]
    public async Task<IActionResult> Image(Guid id, string which, CancellationToken ct)
    {
        var img = await bus.Ask(new GetVerificationImageQuery(id, which), ct);
        Response.Headers.CacheControl = "no-store";
        return File(img.Bytes, img.ContentType);
    }

    [HttpPost("verifications/{id:guid}/approve")]
    public Task<bool> Approve(Guid id, CancellationToken ct) => bus.Send(new ReviewVerificationCommand(User.Id(), id, true, null), ct);

    [HttpPost("verifications/{id:guid}/reject")]
    public Task<bool> Reject(Guid id, [FromBody] RejectBody b, CancellationToken ct) => bus.Send(new ReviewVerificationCommand(User.Id(), id, false, b.Reason), ct);

    [HttpGet("flags")] public Task<List<FeatureFlag>> Flags(CancellationToken ct) => bus.Ask(new ListFlagsQuery(), ct);
    [HttpPost("flags/{key}")] public Task<bool> SetFlag(string key, [FromBody] bool enabled, CancellationToken ct) => bus.Send(new SetFlagCommand(key, enabled), ct);

    // ---- Ad Limit Requests ----
    [HttpGet("limit-requests")]
    public Task<List<AdminLimitRequestDto>> LimitRequests(CancellationToken ct) =>
        bus.Ask(new ListAdminLimitRequestsQuery(), ct);

    [HttpPost("limit-requests/{requestId:guid}/approve")]
    public Task<bool> ApproveLimit(Guid requestId, CancellationToken ct) =>
        bus.Send(new DecideAdminLimitRequestCommand(requestId, true), ct);

    [HttpPost("limit-requests/{requestId:guid}/reject")]
    public Task<bool> RejectLimit(Guid requestId, CancellationToken ct) =>
        bus.Send(new DecideAdminLimitRequestCommand(requestId, false), ct);
}
