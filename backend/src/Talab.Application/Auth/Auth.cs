using Microsoft.EntityFrameworkCore;
using Talab.Application.Realtime;
using Talab.Domain.Entities;

namespace Talab.Application.Auth;

public record GoogleIdentity(string Sub, string Email, string Name);
public record UserDto(Guid Id, string Name, string Email, string Role, bool Verified);
public record AuthResult(string Token, UserDto User);

public interface ITokenService { string Issue(User user); }
public interface IAdminList { bool IsAdmin(string email); }

static class UserMap
{
    public static UserDto ToDto(this User u) => new(u.Id, u.Name, u.Email, u.Role.ToString(), u.Verified);
}

/// <summary>Creates the user on first sign-in (role chosen on the landing page) and returns a JWT.</summary>
public record SignInCommand(GoogleIdentity Identity, Role? Intent) : ICommand<AuthResult>;

public class SignInHandler(IAppDb db, ITokenService tokens, IAdminList admins, IRealtime realtime) : ICommandHandler<SignInCommand, AuthResult>
{
    public async Task<AuthResult> Handle(SignInCommand c, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleSub == c.Identity.Sub, ct);
        var isNew = user is null;
        if (user is null)
        {
            user = new User
            {
                GoogleSub = c.Identity.Sub, Email = c.Identity.Email, Name = c.Identity.Name,
                Role = c.Intent is Role.Owner ? Role.Owner : Role.Tenant, // only these two are self-service
            };
            db.Users.Add(user);
        }
        if (admins.IsAdmin(user.Email)) user.Role = Role.Admin;
        await db.SaveChangesAsync(ct);
        if (isNew) await realtime.ToGroup(RealtimeGroups.Admins, RealtimeEvents.Admin, new { kind = "user" });
        return new AuthResult(tokens.Issue(user), user.ToDto());
    }
}

/// <summary>Switch between Tenant and Owner. Admin/Agent accounts can't self-switch.</summary>
public record SetRoleCommand(Guid UserId, Role Role) : ICommand<AuthResult>;

public class SetRoleHandler(IAppDb db, ITokenService tokens) : ICommandHandler<SetRoleCommand, AuthResult>
{
    public async Task<AuthResult> Handle(SetRoleCommand c, CancellationToken ct)
    {
        if (c.Role is not (Role.Tenant or Role.Owner)) throw new DomainException("You can only choose tenant or owner.");
        var u = await db.Users.FindAsync([c.UserId], ct) ?? throw new DomainException("User not found.");
        if (u.Role is Role.Admin or Role.Agent) throw new DomainException("This account type cannot change role.");
        u.Role = c.Role;
        await db.SaveChangesAsync(ct);
        return new AuthResult(tokens.Issue(u), u.ToDto());
    }
}

public record GetMeQuery(Guid UserId) : IQuery<UserDto>;

public class GetMeHandler(IAppDb db) : IQueryHandler<GetMeQuery, UserDto>
{
    public async Task<UserDto> Handle(GetMeQuery q, CancellationToken ct) =>
        (await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == q.UserId, ct) ?? throw new DomainException("User not found.")).ToDto();
}
