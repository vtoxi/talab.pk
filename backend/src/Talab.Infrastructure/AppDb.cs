using Microsoft.EntityFrameworkCore;
using Talab.Application;
using Talab.Domain.Entities;

namespace Talab.Infrastructure;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options), IAppDb
{
    public DbSet<User> Users => Set<User>();
    public DbSet<PropertyRequest> Requests => Set<PropertyRequest>();
    public DbSet<Offer> Offers => Set<Offer>();
    public DbSet<OwnerPin> OwnerPins => Set<OwnerPin>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Agreement> Agreements => Set<Agreement>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<OwnerVerification> OwnerVerifications => Set<OwnerVerification>();
    public DbSet<FeatureFlag> FeatureFlags => Set<FeatureFlag>();
    public void DropUniqueTenantIndex() { try { Database.ExecuteSqlRaw("DROP INDEX IF EXISTS \"IX_Requests_TenantId\";"); } catch { } }

    protected override void ConfigureConventions(ModelConfigurationBuilder c) => c.Properties<decimal>().HavePrecision(18, 2);

    private static void PartyLengths(Microsoft.EntityFrameworkCore.Metadata.Builders.OwnedNavigationBuilder<Agreement, PartyInfo> p)
    {
        p.Property(x => x.FullName).HasMaxLength(100); p.Property(x => x.FatherName).HasMaxLength(100);
        p.Property(x => x.Address).HasMaxLength(300); p.Property(x => x.Phone).HasMaxLength(20);
    }

    /// <summary>Sensible column lengths, so text columns are not unbounded (nvarchar(max)) on SQL Server.</summary>
    private static void Lengths(ModelBuilder b)
    {
        b.Entity<User>(e => { e.Property(x => x.GoogleSub).HasMaxLength(200); e.Property(x => x.Email).HasMaxLength(320); e.Property(x => x.Name).HasMaxLength(200); e.Property(x => x.City).HasMaxLength(100); });
        b.Entity<PropertyRequest>().Property(x => x.Category).HasMaxLength(40);
        b.Entity<Offer>().Property(x => x.Note).HasMaxLength(1000);
        b.Entity<Message>().Property(x => x.Text).HasMaxLength(1000);
        b.Entity<OwnerPin>().Property(x => x.Name).HasMaxLength(100);
        b.Entity<FeatureFlag>().Property(x => x.Key).HasMaxLength(100);
        b.Entity<OwnerVerification>(e => { e.Property(x => x.FrontKey).HasMaxLength(64); e.Property(x => x.BackKey).HasMaxLength(64); e.Property(x => x.SelfieKey).HasMaxLength(64); e.Property(x => x.RejectReason).HasMaxLength(300); });
        b.Entity<Notification>(e => { e.Property(x => x.Title).HasMaxLength(300); e.Property(x => x.Body).HasMaxLength(1000); e.Property(x => x.Link).HasMaxLength(200); e.Property(x => x.CoalesceKey).HasMaxLength(100); });
        b.Entity<Agreement>(e =>
        {
            e.Property(x => x.City).HasMaxLength(40); e.Property(x => x.PropertyAddress).HasMaxLength(300);
            e.Property(x => x.PropertyDetails).HasMaxLength(500); e.Property(x => x.UtilitiesNote).HasMaxLength(300);
            e.OwnsOne(x => x.Landlord, PartyLengths);
            e.OwnsOne(x => x.Tenant, PartyLengths);
        });
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        Lengths(b);
        var pg = Database.IsNpgsql();
        if (pg) b.HasPostgresExtension("postgis");

        b.Entity<User>().HasIndex(u => u.GoogleSub).IsUnique();
        b.Entity<FeatureFlag>().HasKey(f => f.Key);
        b.Entity<FeatureFlag>().HasData(new FeatureFlag { Key = "agents_enabled", Enabled = false });

        var r = b.Entity<PropertyRequest>();
        r.Property(x => x.Details).HasColumnType(pg ? "jsonb" : "nvarchar(max)");
        r.Property(x => x.Area).HasColumnType(pg ? "geometry(Polygon,4326)" : "geometry");
        if (pg) r.HasIndex(x => x.Area).HasMethod("gist");
        // one open request per tenant (Status 0 = Open)
        r.HasIndex(x => x.TenantId);

        b.Entity<OwnerPin>().Property(x => x.Location).HasColumnType(pg ? "geometry(Point,4326)" : "geometry");
        b.Entity<OwnerPin>().HasIndex(x => x.OwnerId);

        b.Entity<OwnerVerification>().HasIndex(x => x.UserId).IsUnique();
        b.Entity<OwnerVerification>().HasIndex(x => x.Status);

        b.Entity<Notification>().HasIndex(x => new { x.UserId, x.ReadAt, x.CreatedAt });

        var ag = b.Entity<Agreement>();
        ag.HasIndex(x => x.OfferId).IsUnique();
        ag.OwnsOne(x => x.Landlord, p => p.Property(y => y.CnicProtected).HasMaxLength(400));
        ag.OwnsOne(x => x.Tenant, p => p.Property(y => y.CnicProtected).HasMaxLength(400));

        b.Entity<Message>().HasIndex(x => new { x.OfferId, x.CreatedAt });
        b.Entity<Offer>().HasIndex(x => new { x.RequestId, x.OwnerId }).IsUnique(); // one offer per owner per request
        b.Entity<Offer>().Property(x => x.Location).HasColumnType(pg ? "geometry(Point,4326)" : "geometry");
    }
}
