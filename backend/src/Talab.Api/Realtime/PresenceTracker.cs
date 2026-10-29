namespace Talab.Api.Realtime;

/// <summary>
/// Who is in which chat room right now. In memory, so with more than one API server this needs a shared store
/// (the same place a SignalR Redis backplane would run).
/// </summary>
public class PresenceTracker
{
    private readonly object gate = new();
    private readonly Dictionary<string, (Guid User, HashSet<Guid> Offers)> connections = new();

    public void Join(string connectionId, Guid userId, Guid offerId)
    {
        lock (gate)
        {
            if (!connections.TryGetValue(connectionId, out var c)) connections[connectionId] = c = (userId, new HashSet<Guid>());
            c.Offers.Add(offerId);
        }
    }

    public bool IsIn(string connectionId, Guid offerId)
    {
        lock (gate) return connections.TryGetValue(connectionId, out var c) && c.Offers.Contains(offerId);
    }

    /// <summary>Is a different user in this room?</summary>
    public bool OtherOnline(Guid offerId, Guid me)
    {
        lock (gate) return connections.Values.Any(c => c.User != me && c.Offers.Contains(offerId));
    }

    /// <summary>Removes the connection from one room. True when that user has no other connection left in it.</summary>
    public bool Leave(string connectionId, Guid offerId)
    {
        lock (gate)
        {
            if (!connections.TryGetValue(connectionId, out var c) || !c.Offers.Remove(offerId)) return false;
            var last = !connections.Any(kv => kv.Key != connectionId && kv.Value.User == c.User && kv.Value.Offers.Contains(offerId));
            if (c.Offers.Count == 0) connections.Remove(connectionId);
            return last;
        }
    }

    /// <summary>Connection closed: leaves every room. Returns the rooms where the user is now gone.</summary>
    public List<Guid> LeaveAll(string connectionId)
    {
        lock (gate)
        {
            if (!connections.Remove(connectionId, out var c)) return [];
            return c.Offers.Where(o => !connections.Values.Any(v => v.User == c.User && v.Offers.Contains(o))).ToList();
        }
    }
}
