using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Talab.Api.Auth;
using Talab.Application;
using Talab.Application.Requests;

namespace Talab.Api.Controllers;

[ApiController, Route("api/requests"), Authorize(Roles = "Tenant")]
public class RequestsController(IDispatcher bus) : ControllerBase
{
    [HttpGet("mine")]
    public Task<MyRequest?> Mine(CancellationToken ct) => bus.Ask(new GetMyRequestQuery(User.Id()), ct);

    [HttpGet("mine/all")]
    public Task<List<MyRequest>> MineAll(CancellationToken ct) => bus.Ask(new ListMyRequestsQuery(User.Id()), ct);

    // The tenant id always comes from the token, never from the body.
    [HttpPost]
    public async Task<IActionResult> Create(CreateRequestCommand c, CancellationToken ct) =>
        Created("api/requests/mine", new { id = await bus.Send(c with { TenantId = User.Id() }, ct) });

    [HttpPut("mine")]
    public Task<bool> Update(UpdateRequestCommand c, CancellationToken ct) =>
        bus.Send(c with { TenantId = User.Id() }, ct);

    [HttpPost("mine/found")]
    public Task<bool> Found(CancellationToken ct) => bus.Send(new MarkFoundCommand(User.Id()), ct);

    [HttpGet("mine/suggestions")]
    public Task<List<SuggestedPlace>> Suggestions(CancellationToken ct) =>
        bus.Ask(new GetSuggestedPlacesQuery(User.Id()), ct);

    [HttpPost("mine/nudge/{pinId:guid}")]
    public Task<bool> Nudge(Guid pinId, CancellationToken ct) =>
        bus.Send(new NudgeOwnerCommand(User.Id(), pinId), ct);

    // ---- Ad Limit & Quota System ----
    [HttpGet("limit-status")]
    public Task<AdLimitStatus> LimitStatus(CancellationToken ct) =>
        bus.Ask(new GetAdLimitStatusQuery(User.Id()), ct);

    [HttpPost("request-limit")]
    public Task<AdLimitStatus> RequestLimit(CancellationToken ct) =>
        bus.Send(new RequestAdLimitCommand(User.Id()), ct);

    [HttpPost("claim-approved-limit")]
    public Task<AdLimitStatus> ClaimLimit([FromQuery] bool expedite, CancellationToken ct) =>
        bus.Send(new ClaimApprovedLimitCommand(User.Id(), expedite), ct);
}
