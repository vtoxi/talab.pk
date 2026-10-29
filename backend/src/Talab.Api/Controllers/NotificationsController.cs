using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Talab.Api.Auth;
using Talab.Application;
using Talab.Application.Notifications;

namespace Talab.Api.Controllers;

[ApiController, Route("api/notifications"), Authorize]
public class NotificationsController(IDispatcher bus) : ControllerBase
{
    [HttpGet] public Task<InboxDto> Inbox(CancellationToken ct) => bus.Ask(new GetInboxQuery(User.Id()), ct);

    [HttpGet("unread-count")] public Task<int> Unread(CancellationToken ct) => bus.Ask(new GetUnreadCountQuery(User.Id()), ct);

    [HttpPost("{id:guid}/read")] public Task<bool> Read(Guid id, CancellationToken ct) => bus.Send(new MarkReadCommand(User.Id(), id), ct);

    [HttpPost("read-all")] public Task<bool> ReadAll(CancellationToken ct) => bus.Send(new MarkReadCommand(User.Id(), null), ct);

    [HttpGet("email")] public Task<bool> Email(CancellationToken ct) => bus.Ask(new GetEmailPrefQuery(User.Id()), ct);

    [HttpPut("email")] public Task<bool> SetEmail([FromBody] bool enabled, CancellationToken ct) => bus.Send(new SetEmailPrefCommand(User.Id(), enabled), ct);
}
