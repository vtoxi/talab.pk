using Microsoft.EntityFrameworkCore;
using Talab.Domain.Entities;

namespace Talab.Application;

/// <summary>Persistence port. Implemented by Infrastructure (EF Core).</summary>
public interface IAppDb
{
    DbSet<User> Users { get; }
    DbSet<PropertyRequest> Requests { get; }
    DbSet<Offer> Offers { get; }
    DbSet<OwnerPin> OwnerPins { get; }
    DbSet<Message> Messages { get; }
    DbSet<Agreement> Agreements { get; }
    DbSet<Notification> Notifications { get; }
    DbSet<OwnerVerification> OwnerVerifications { get; }
    DbSet<FeatureFlag> FeatureFlags { get; }
    void DropUniqueTenantIndex();
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
