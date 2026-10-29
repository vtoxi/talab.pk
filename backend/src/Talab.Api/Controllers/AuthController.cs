using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Talab.Api.Auth;
using Talab.Application;
using Talab.Application.Auth;
using Talab.Domain.Entities;

namespace Talab.Api.Controllers;

public record GoogleSignInBody(string IdToken, Role? Intent);
public record DevSignInBody(string Email, string Name, Role? Intent);

[ApiController, Route("api/auth")]
public class AuthController(IDispatcher bus, GoogleVerifier google, IConfiguration cfg, IWebHostEnvironment env) : ControllerBase
{
    [HttpPost("google"), EnableRateLimiting("auth")]
    public async Task<AuthResult> Google(GoogleSignInBody b, CancellationToken ct) =>
        await bus.Send(new SignInCommand(await google.Verify(b.IdToken), b.Intent), ct);

    /// <summary>Local testing only: enabled when running in Development with Auth:DevLogin=true. Never in production.</summary>
    [HttpPost("dev"), EnableRateLimiting("auth")]
    public async Task<IActionResult> Dev(DevSignInBody b, CancellationToken ct)
    {
        if (!env.IsDevelopment() || !cfg.GetValue<bool>("Auth:DevLogin")) return NotFound();
        if (string.IsNullOrWhiteSpace(b.Email) || !b.Email.Contains('@')) return BadRequest(new { error = "Enter a valid email." });
        var id = new GoogleIdentity("dev:" + b.Email.ToLowerInvariant(), b.Email.ToLowerInvariant(), string.IsNullOrWhiteSpace(b.Name) ? b.Email : b.Name);
        return Ok(await bus.Send(new SignInCommand(id, b.Intent), ct));
    }

    [Authorize, HttpGet("me")]
    public Task<UserDto> Me(CancellationToken ct) => bus.Ask(new GetMeQuery(User.Id()), ct);

    [Authorize, HttpPost("role")]
    public Task<AuthResult> SetRole([FromBody] Role role, CancellationToken ct) => bus.Send(new SetRoleCommand(User.Id(), role), ct);
}
