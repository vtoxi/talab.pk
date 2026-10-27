using NetTopologySuite.Geometries;

namespace Talab.Domain.Entities;

public enum Role { Tenant, Owner, Agent, Admin }
public enum RequestStatus { Open, Found, Expired }
public enum OfferStatus { Pending, Accepted, Rejected, Withdrawn }
public enum MessageKind { Text, Counter }

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string GoogleSub { get; set; } = "";
    public string Email { get; set; } = "";
    public string Name { get; set; } = "";
    public Role Role { get; set; } = Role.Tenant;
    public bool Verified { get; set; }
    public string? City { get; set; }
    public bool EmailNotifications { get; set; } = true;
}

public class PropertyRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Category { get; set; } = "property";
    public string Details { get; set; } = "{}"; // jsonb: type, bedrooms, etc.
    public decimal BudgetMin { get; set; }
    public decimal BudgetMax { get; set; }
    public DateOnly MoveIn { get; set; }
    public Polygon Area { get; set; } = null!; // circle stored as polygon
    public RequestStatus Status { get; set; } = RequestStatus.Open;
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(30);
}

public class Offer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequestId { get; set; }
    public Guid OwnerId { get; set; }
    public Point Location { get; set; } = null!; // must lie inside request.Area
    public decimal Rent { get; set; }
    public decimal Advance { get; set; }
    public DateOnly AvailableFrom { get; set; }
    public string? Note { get; set; }
    public OfferStatus Status { get; set; } = OfferStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Message
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OfferId { get; set; }
    public Guid SenderId { get; set; }
    public MessageKind Kind { get; set; }
    public string Text { get; set; } = "";
    public decimal? Rent { get; set; }     // Counter only
    public decimal? Advance { get; set; }  // Counter only
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>When the other side opened the chat and saw it.</summary>
    public DateTime? ReadAt { get; set; }
}

public class FeatureFlag
{
    public string Key { get; set; } = "";
    public bool Enabled { get; set; }
}
