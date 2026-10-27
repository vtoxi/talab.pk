using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Talab.Api.Auth;
using Talab.Application;
using Talab.Application.Offers;

namespace Talab.Api.Controllers;

public record NewOffer(decimal Rent, decimal Advance, DateOnly AvailableFrom, string? Note);
public record Terms(decimal Rent, decimal Advance);
public record Text(string Body);

/// <summary>Offer thread shared by the tenant and the offering owner. Access is checked in the handlers.</summary>
[ApiController, Route("api"), Authorize(Roles = "Tenant,Owner")]
public class OffersController(IDispatcher bus) : ControllerBase
{
    [HttpPost("owner/requests/{requestId:guid}/offer"), Authorize(Roles = "Owner")]
    public async Task<IActionResult> Create(Guid requestId, NewOffer o, CancellationToken ct) =>
        Ok(new { id = await bus.Send(new CreateOfferCommand(User.Id(), requestId, o.Rent, o.Advance, o.AvailableFrom, o.Note), ct) });

    [HttpGet("owner/offers"), Authorize(Roles = "Owner")]
    public Task<List<OfferSummary>> OwnerOffers(CancellationToken ct) => bus.Ask(new ListOwnerOffersQuery(User.Id()), ct);

    [HttpGet("requests/mine/offers"), Authorize(Roles = "Tenant")]
    public Task<List<OfferSummary>> TenantOffers(CancellationToken ct) => bus.Ask(new ListTenantOffersQuery(User.Id()), ct);

    [HttpGet("offers/{id:guid}")]
    public Task<ThreadDto> Thread(Guid id, CancellationToken ct) => bus.Ask(new GetThreadQuery(User.Id(), id), ct);

    [HttpPost("offers/{id:guid}/messages"), EnableRateLimiting("chat")]
    public Task<bool> Send(Guid id, Text t, CancellationToken ct) => bus.Send(new SendMessageCommand(User.Id(), id, t.Body), ct);

    [HttpPost("offers/{id:guid}/counter")]
    public Task<bool> Counter(Guid id, Terms t, CancellationToken ct) => bus.Send(new CounterOfferCommand(User.Id(), id, t.Rent, t.Advance), ct);

    [HttpPost("offers/{id:guid}/accept")]
    public Task<bool> Accept(Guid id, CancellationToken ct) => bus.Send(new DecideOfferCommand(User.Id(), id, OfferAction.Accept), ct);

    [HttpPost("offers/{id:guid}/reject")]
    public Task<bool> Reject(Guid id, CancellationToken ct) => bus.Send(new DecideOfferCommand(User.Id(), id, OfferAction.Reject), ct);

    [HttpPost("offers/{id:guid}/withdraw")]
    public Task<bool> Withdraw(Guid id, CancellationToken ct) => bus.Send(new DecideOfferCommand(User.Id(), id, OfferAction.Withdraw), ct);
}
