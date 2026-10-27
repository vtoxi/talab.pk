using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Talab.Api.Auth;
using Talab.Application;
using Talab.Application.Owner;
using Talab.Application.Verification;

namespace Talab.Api.Controllers;

public record NewPin(string Name, double Lat, double Lng);

[ApiController, Route("api/owner"), Authorize(Roles = "Owner")]
public class OwnerController(IDispatcher bus) : ControllerBase
{
    [HttpGet("feed")]
    public Task<List<MatchedRequest>> Feed(CancellationToken ct) => bus.Ask(new ListMatchedRequestsQuery(User.Id()), ct);

    [HttpGet("verification")]
    public Task<VerificationStatusDto> Verification(CancellationToken ct) => bus.Ask(new GetMyVerificationQuery(User.Id()), ct);

    [HttpPost("verification"), RequestSizeLimit(20_000_000), EnableRateLimiting("upload")]
    public async Task<bool> Submit(IFormFile front, IFormFile back, IFormFile selfie, CancellationToken ct) =>
        await bus.Send(new SubmitVerificationCommand(User.Id(), await Bytes(front), await Bytes(back), await Bytes(selfie)), ct);

    // Reject oversized files before copying them into memory.
    private static async Task<byte[]> Bytes(IFormFile f)
    {
        if (f.Length > ImageRules.MaxBytes) throw new Talab.Application.DomainException("A photo is too big. Use photos under 5 MB.");
        using var ms = new MemoryStream();
        await f.CopyToAsync(ms);
        return ms.ToArray();
    }

    [HttpGet("pins")]
    public Task<List<PinDto>> Pins(CancellationToken ct) => bus.Ask(new ListPinsQuery(User.Id()), ct);

    [HttpPost("pins")]
    public async Task<IActionResult> AddPin(NewPin p, CancellationToken ct) =>
        Ok(new { id = await bus.Send(new AddPinCommand(User.Id(), p.Name, p.Lat, p.Lng), ct) });

    [HttpDelete("pins/{id:guid}")]
    public Task<bool> DeletePin(Guid id, CancellationToken ct) => bus.Send(new DeletePinCommand(User.Id(), id), ct);
}
