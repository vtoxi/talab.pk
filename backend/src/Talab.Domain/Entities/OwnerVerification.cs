namespace Talab.Domain.Entities;

public enum VerificationStatus { Pending, Approved, Rejected }

/// <summary>Owner identity check: CNIC front/back and a selfie, stored encrypted; reviewed by an admin.</summary>
public class OwnerVerification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string FrontKey { get; set; } = "";
    public string BackKey { get; set; } = "";
    public string SelfieKey { get; set; } = "";
    public VerificationStatus Status { get; set; } = VerificationStatus.Pending;
    public string? RejectReason { get; set; }
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAt { get; set; }
    public Guid? ReviewedBy { get; set; }
}
