using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Google.Apis.Auth;
using Microsoft.IdentityModel.Tokens;
using Talab.Application;
using Talab.Application.Auth;
using Talab.Domain.Entities;

namespace Talab.Api.Auth;

public class TokenService(IConfiguration cfg) : ITokenService
{
    public string Issue(User u)
    {
        var key = cfg["Jwt:Key"];
        if (string.IsNullOrEmpty(key) || key.Length < 32) throw new InvalidOperationException("Jwt:Key must be set (32+ chars).");
        var token = new JwtSecurityToken(
            issuer: "talab", audience: "talab",
            claims: [new(ClaimTypes.NameIdentifier, u.Id.ToString()), new(ClaimTypes.Email, u.Email),
                     new(ClaimTypes.Name, u.Name), new(ClaimTypes.Role, u.Role.ToString())],
            expires: DateTime.UtcNow.AddDays(14),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public class AdminList(IConfiguration cfg) : IAdminList
{
    public bool IsAdmin(string email) =>
        (cfg.GetSection("Admin:Emails").Get<string[]>() ?? []).Contains(email, StringComparer.OrdinalIgnoreCase);
}

public class GoogleVerifier(IConfiguration cfg)
{
    public async Task<GoogleIdentity> Verify(string idToken)
    {
        var clientId = cfg["Google:ClientId"];
        if (string.IsNullOrEmpty(clientId)) throw new DomainException("Google sign-in is not configured.");
        try
        {
            var p = await GoogleJsonWebSignature.ValidateAsync(idToken, new() { Audience = [clientId] });
            if (!p.EmailVerified) throw new DomainException("Your Google email is not verified.");
            return new GoogleIdentity(p.Subject, p.Email, p.Name ?? p.Email);
        }
        catch (InvalidJwtException) { throw new DomainException("Google sign-in failed. Please try again."); }
    }
}

public static class CurrentUser
{
    public static Guid Id(this ClaimsPrincipal u) => Guid.Parse(u.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
