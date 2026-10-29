namespace Talab.Domain.Entities;

public enum NotificationType { NewRequest, NewOffer, NewMessage, OfferUpdate, Verification }

public class Notification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public NotificationType Type { get; set; }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    /// <summary>Title and Body are English templates like "{name} suggested new terms"; this JSON holds the values so the client can show them in any language.</summary>
    public string ParamsJson { get; set; } = "{}";
    /// <summary>App route to open, e.g. /offers/{id}.</summary>
    public string Link { get; set; } = "";
    /// <summary>While one unread notification with this key exists, new events update it instead of adding more (chat messages).</summary>
    public string? CoalesceKey { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }
}
