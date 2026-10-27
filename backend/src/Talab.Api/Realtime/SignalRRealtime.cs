using Microsoft.AspNetCore.SignalR;
using Talab.Application.Realtime;

namespace Talab.Api.Realtime;

/// <summary>Pushes events through the hub. Failures are logged and swallowed: clients re-fetch on reconnect anyway.</summary>
public class SignalRRealtime(IHubContext<AppHub> hub, ILogger<SignalRRealtime> log) : IRealtime
{
    public Task ToUser(Guid userId, string eventName, object payload) => Send(RealtimeGroups.User(userId), eventName, payload);
    public Task ToOffer(Guid offerId, string eventName, object payload) => Send(RealtimeGroups.Offer(offerId), eventName, payload);
    public Task ToGroup(string group, string eventName, object payload) => Send(group, eventName, payload);

    private async Task Send(string group, string eventName, object payload)
    {
        try { await hub.Clients.Group(group).SendAsync(eventName, payload); }
        catch (Exception e) { log.LogWarning(e, "Could not push {Event} to {Group}", eventName, group); }
    }
}
