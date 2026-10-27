using NetTopologySuite.Geometries;

namespace Talab.Domain.Entities;

/// <summary>A place the owner can rent out. A request whose drawn area contains a pin is "matched" to that owner.</summary>
public class OwnerPin
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OwnerId { get; set; }
    public string Name { get; set; } = "";
    public Point Location { get; set; } = null!;
}
