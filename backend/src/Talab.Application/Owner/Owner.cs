using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using Talab.Domain.Entities;

namespace Talab.Application.Owner;

public record PinDto(Guid Id, string Name, double Lat, double Lng);

public record ListPinsQuery(Guid OwnerId) : IQuery<List<PinDto>>;

public class ListPinsHandler(IAppDb db) : IQueryHandler<ListPinsQuery, List<PinDto>>
{
    public Task<List<PinDto>> Handle(ListPinsQuery q, CancellationToken ct) =>
        db.OwnerPins.AsNoTracking().Where(p => p.OwnerId == q.OwnerId).OrderBy(p => p.Name)
            .Select(p => new PinDto(p.Id, p.Name, p.Location.Y, p.Location.X)).ToListAsync(ct);
}

public record AddPinCommand(Guid OwnerId, string Name, double Lat, double Lng) : ICommand<Guid>;

public class AddPinHandler(IAppDb db) : ICommandHandler<AddPinCommand, Guid>
{
    private static readonly GeometryFactory Gf = new(new PrecisionModel(), 4326);
    private const int MaxPins = 20;

    public async Task<Guid> Handle(AddPinCommand c, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(c.Name)) throw new DomainException("Give this place a name.");
        if (c.Lat is < -90 or > 90 || c.Lng is < -180 or > 180) throw new DomainException("Invalid location.");
        if (await db.OwnerPins.CountAsync(p => p.OwnerId == c.OwnerId, ct) >= MaxPins) throw new DomainException($"You can save up to {MaxPins} places.");

        var pin = new OwnerPin { OwnerId = c.OwnerId, Name = c.Name.Trim(), Location = Gf.CreatePoint(new Coordinate(c.Lng, c.Lat)) };
        db.OwnerPins.Add(pin);
        await db.SaveChangesAsync(ct);
        return pin.Id;
    }
}

public record DeletePinCommand(Guid OwnerId, Guid PinId) : ICommand<bool>;

public class DeletePinHandler(IAppDb db) : ICommandHandler<DeletePinCommand, bool>
{
    public async Task<bool> Handle(DeletePinCommand c, CancellationToken ct)
    {
        var pin = await db.OwnerPins.FirstOrDefaultAsync(p => p.Id == c.PinId && p.OwnerId == c.OwnerId, ct)
                  ?? throw new DomainException("Place not found.");
        db.OwnerPins.Remove(pin);
        await db.SaveChangesAsync(ct);
        return true;
    }
}

public record MatchedRequest(Guid Id, string Category, string Details, decimal BudgetMin, decimal BudgetMax, DateOnly MoveIn, string? MatchedPlace, Guid? OfferId);

/// <summary>Open requests whose drawn area contains at least one of the owner's saved places.</summary>
public record ListMatchedRequestsQuery(Guid OwnerId) : IQuery<List<MatchedRequest>>;

public class ListMatchedRequestsHandler(IAppDb db) : IQueryHandler<ListMatchedRequestsQuery, List<MatchedRequest>>
{
    public Task<List<MatchedRequest>> Handle(ListMatchedRequestsQuery q, CancellationToken ct) =>
        db.Requests.AsNoTracking()
            .Where(r => r.Status == RequestStatus.Open && r.ExpiresAt > DateTime.UtcNow
                        && db.OwnerPins.Any(p => p.OwnerId == q.OwnerId && r.Area.Contains(p.Location)))
            .OrderByDescending(r => r.ExpiresAt)
            .Select(r => new MatchedRequest(r.Id, r.Category, r.Details, r.BudgetMin, r.BudgetMax, r.MoveIn,
                db.OwnerPins.Where(p => p.OwnerId == q.OwnerId && r.Area.Contains(p.Location)).Select(p => p.Name).FirstOrDefault(),
                db.Offers.Where(o => o.RequestId == r.Id && o.OwnerId == q.OwnerId).Select(o => (Guid?)o.Id).FirstOrDefault()))
            .Take(100)
            .ToListAsync(ct);
}
