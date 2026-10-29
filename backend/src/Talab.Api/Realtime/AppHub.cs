using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Talab.Api.Auth;
using Talab.Application;
using Talab.Application.Realtime;

namespace Talab.Api.Realtime;

/// <summary>
/// One hub for the whole app. Every connection joins its own user group (plus "owners" or "admins" by role)
/// so the server can push to a person, not a connection. Chat rooms are per offer and only open to its two parties.
/// </summary>
[Authorize]
public class AppHub(IDispatcher bus, PresenceTracker presence) : Hub
{
    private Guid Me => Context.User!.Id();

    public override async Task OnConnectedAsync()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.User(Me));
        switch (Context.User!.FindFirstValue(ClaimTypes.Role))
        {
            case "Admin": await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.Admins); break;
            case "Owner": await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.Owners); break;
        }
        await base.OnConnectedAsync();
    }

    /// <summary>Enter an offer's chat room. Returns whether the other person is in it right now; null when not allowed.</summary>
    public async Task<bool?> JoinOffer(Guid offerId)
    {
        if (!await bus.Ask(new CanAccessOfferQuery(Me, offerId))) return null;

        presence.Join(Context.ConnectionId, Me, offerId);
        await Groups.AddToGroupAsync(Context.ConnectionId, RealtimeGroups.Offer(offerId));
        await Clients.OthersInGroup(RealtimeGroups.Offer(offerId)).SendAsync("presence", new { offerId, online = true });
        return presence.OtherOnline(offerId, Me);
    }

    public async Task LeaveOffer(Guid offerId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, RealtimeGroups.Offer(offerId));
        if (presence.Leave(Context.ConnectionId, offerId)) // this was the user's last connection in the room
            await Clients.Group(RealtimeGroups.Offer(offerId)).SendAsync("presence", new { offerId, online = false });
    }

    /// <summary>"Typing…" for the other person. Ignored unless this connection is in the room.</summary>
    public Task Typing(Guid offerId) =>
        presence.IsIn(Context.ConnectionId, offerId)
            ? Clients.OthersInGroup(RealtimeGroups.Offer(offerId)).SendAsync("typing", new { offerId })
            : Task.CompletedTask;

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var offerId in presence.LeaveAll(Context.ConnectionId))
            await Clients.Group(RealtimeGroups.Offer(offerId)).SendAsync("presence", new { offerId, online = false });
        await base.OnDisconnectedAsync(exception);
    }
}
