using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Talab.Application.Realtime;
using Talab.Domain.Entities;

namespace Talab.Application.Agreements;

public record PartyDto(string FullName, string FatherName, string Cnic, string Address, string Phone);
public record TermsDto(string City, string PropertyAddress, string PropertyDetails, DateOnly? StartDate, int TermMonths,
    decimal AnnualIncreasePercent, int NoticeDays, string UtilitiesNote);

public record AgreementDraft(Guid OfferId, string Type, bool IsOwner, decimal Rent, decimal Advance,
    PartyDto? Me, string OtherName, PartyDto? Other, TermsDto? Terms, List<string> Missing, bool Ready);

public record AgreementData(string Type, DateOnly Date, PartyDto Landlord, PartyDto Tenant, TermsDto Terms, decimal Rent, decimal Advance);

/// <summary>Port implemented by Infrastructure (PDF library lives there).</summary>
public interface IAgreementRenderer { byte[] Render(AgreementData data); }

/// <summary>Port for encrypting CNIC numbers at rest.</summary>
public interface ISecretProtector { string Protect(string plain); string Unprotect(string protectedText); }

public static class AgreementRules
{
    public static readonly string[] Cities = ["Islamabad", "Rawalpindi", "Other Punjab", "Other"];

    public static string TypeFor(string requestDetails)
    {
        try { return System.Text.Json.JsonDocument.Parse(requestDetails).RootElement.GetProperty("type").GetString() is "shop" or "office" ? "Commercial" : "Residential"; }
        catch { return "Residential"; }
    }

    public static string NormalizeCnic(string s)
    {
        var d = Regex.Replace(s ?? "", @"[\s-]", "");
        if (!Regex.IsMatch(d, @"^\d{13}$")) throw new DomainException("CNIC must be 13 digits, like 12345-1234567-1.");
        return d;
    }

    public static string FormatCnic(string d) => d.Length == 13 ? $"{d[..5]}-{d.Substring(5, 7)}-{d[12]}" : d;
    public static string MaskCnic(string d) => d.Length == 13 ? $"*****-*******-{d[12]}" : "";

    public static string NormalizePhone(string s)
    {
        var d = Regex.Replace(s ?? "", @"[\s-]", "");
        if (!Regex.IsMatch(d, @"^\+?\d{10,13}$")) throw new DomainException("Enter a valid phone number, like 0300-1234567.");
        return d;
    }

    static string Required(string? v, string label, int max)
    {
        var t = v?.Trim() ?? "";
        if (t.Length == 0) throw new DomainException($"{label} is required.");
        if (t.Length > max) throw new DomainException($"{label} is too long.");
        return t;
    }

    public static PartyInfo ToInfo(PartyDto p, ISecretProtector protector) => new()
    {
        FullName = Required(p.FullName, "Full name", 100),
        FatherName = Required(p.FatherName, "Father's or husband's name", 100),
        CnicProtected = protector.Protect(NormalizeCnic(p.Cnic)),
        Address = Required(p.Address, "Address", 300),
        Phone = NormalizePhone(p.Phone),
    };

    public static PartyDto? ToDto(PartyInfo p, ISecretProtector protector, bool maskCnic)
    {
        if (p.FullName == "") return null;
        var cnic = protector.Unprotect(p.CnicProtected);
        return new PartyDto(p.FullName, p.FatherName, maskCnic ? MaskCnic(cnic) : FormatCnic(cnic), p.Address, p.Phone);
    }

    public static TermsDto? ToDto(Agreement a) => a.StartDate is null ? null :
        new TermsDto(a.City, a.PropertyAddress, a.PropertyDetails, a.StartDate, a.TermMonths, a.AnnualIncreasePercent, a.NoticeDays, a.UtilitiesNote);
}

/// <summary>Loads the accepted offer for a party and creates the draft on first use.</summary>
class AgreementContext
{
    public required Offer Offer; public required PropertyRequest Request; public required Agreement Agreement;
    public bool IsOwner;

    public static async Task<AgreementContext> Load(IAppDb db, Guid offerId, Guid userId, CancellationToken ct)
    {
        var offer = await db.Offers.FirstOrDefaultAsync(o => o.Id == offerId, ct) ?? throw new DomainException("Offer not found.");
        var req = await db.Requests.AsNoTracking().FirstAsync(r => r.Id == offer.RequestId, ct);
        if (userId != offer.OwnerId && userId != req.TenantId) throw new DomainException("Offer not found.");
        if (offer.Status != OfferStatus.Accepted) throw new DomainException("The agreement can be prepared once the tenant accepts the offer.");

        var ag = await db.Agreements.FirstOrDefaultAsync(a => a.OfferId == offerId, ct);
        if (ag is null) { ag = new Agreement { OfferId = offerId }; db.Agreements.Add(ag); }
        return new AgreementContext { Offer = offer, Request = req, Agreement = ag, IsOwner = userId == offer.OwnerId };
    }
}

// ---------- read the draft ----------
public record GetAgreementQuery(Guid UserId, Guid OfferId) : IQuery<AgreementDraft>;

public class GetAgreementHandler(IAppDb db, ISecretProtector protector) : IQueryHandler<GetAgreementQuery, AgreementDraft>
{
    public async Task<AgreementDraft> Handle(GetAgreementQuery q, CancellationToken ct)
    {
        var c = await AgreementContext.Load(db, q.OfferId, q.UserId, ct);
        await db.SaveChangesAsync(ct); // persists a brand-new empty draft

        var me = c.IsOwner ? c.Agreement.Landlord : c.Agreement.Tenant;
        var other = c.IsOwner ? c.Agreement.Tenant : c.Agreement.Landlord;
        var otherId = c.IsOwner ? c.Request.TenantId : c.Offer.OwnerId;
        var otherName = await db.Users.AsNoTracking().Where(u => u.Id == otherId).Select(u => u.Name).FirstAsync(ct);

        var missing = new List<string>();
        if (c.Agreement.Landlord.FullName == "") missing.Add("Owner's details");
        if (c.Agreement.Tenant.FullName == "") missing.Add("Tenant's details");
        if (c.Agreement.StartDate is null) missing.Add("Property and terms");

        return new AgreementDraft(c.Offer.Id, AgreementRules.TypeFor(c.Request.Details), c.IsOwner, c.Offer.Rent, c.Offer.Advance,
            AgreementRules.ToDto(me, protector, false), otherName, AgreementRules.ToDto(other, protector, true),
            AgreementRules.ToDto(c.Agreement), missing, missing.Count == 0);
    }
}

// ---------- save my own details ----------
public record SavePartyCommand(Guid UserId, Guid OfferId, PartyDto Party) : ICommand<bool>;

public class SavePartyHandler(IAppDb db, ISecretProtector protector, IRealtime realtime) : ICommandHandler<SavePartyCommand, bool>
{
    public async Task<bool> Handle(SavePartyCommand c, CancellationToken ct)
    {
        var ctx = await AgreementContext.Load(db, c.OfferId, c.UserId, ct);
        var info = AgreementRules.ToInfo(c.Party, protector);
        if (ctx.IsOwner) ctx.Agreement.Landlord = info; else ctx.Agreement.Tenant = info;
        ctx.Agreement.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await realtime.ToOffer(c.OfferId, RealtimeEvents.Agreement, new { offerId = c.OfferId });
        return true;
    }
}

// ---------- owner saves property + terms ----------
public record SaveTermsCommand(Guid UserId, Guid OfferId, TermsDto Terms) : ICommand<bool>;

public class SaveTermsHandler(IAppDb db, IRealtime realtime) : ICommandHandler<SaveTermsCommand, bool>
{
    public async Task<bool> Handle(SaveTermsCommand c, CancellationToken ct)
    {
        var ctx = await AgreementContext.Load(db, c.OfferId, c.UserId, ct);
        if (!ctx.IsOwner) throw new DomainException("Only the owner fills in the property and terms.");

        var t = c.Terms;
        if (!AgreementRules.Cities.Contains(t.City)) throw new DomainException("Choose the city of the property.");
        if (t.StartDate is null || t.StartDate < DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-7)) throw new DomainException("Choose a start date that is not in the past.");
        if (t.TermMonths is < 1 or > 60) throw new DomainException("The rental period must be between 1 and 60 months.");
        if (t.AnnualIncreasePercent is < 0 or > 25) throw new DomainException("Yearly rent increase must be between 0% and 25%.");
        if (t.NoticeDays is < 7 or > 90) throw new DomainException("Notice period must be between 7 and 90 days.");
        var address = t.PropertyAddress?.Trim() ?? "";
        if (address.Length is 0 or > 300) throw new DomainException("Enter the full address of the property.");
        if ((t.PropertyDetails?.Length ?? 0) > 500 || (t.UtilitiesNote?.Length ?? 0) > 300) throw new DomainException("Text is too long.");

        var a = ctx.Agreement;
        a.City = t.City; a.PropertyAddress = address; a.PropertyDetails = t.PropertyDetails?.Trim() ?? "";
        a.StartDate = t.StartDate; a.TermMonths = t.TermMonths; a.AnnualIncreasePercent = t.AnnualIncreasePercent;
        a.NoticeDays = t.NoticeDays; a.UtilitiesNote = t.UtilitiesNote?.Trim() ?? "";
        a.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await realtime.ToOffer(c.OfferId, RealtimeEvents.Agreement, new { offerId = c.OfferId });
        return true;
    }
}

// ---------- make the PDF ----------
public record RenderAgreementQuery(Guid UserId, Guid OfferId) : IQuery<byte[]>;

public class RenderAgreementHandler(IAppDb db, ISecretProtector protector, IAgreementRenderer renderer) : IQueryHandler<RenderAgreementQuery, byte[]>
{
    public async Task<byte[]> Handle(RenderAgreementQuery q, CancellationToken ct)
    {
        var c = await AgreementContext.Load(db, q.OfferId, q.UserId, ct);
        var a = c.Agreement;
        if (a.Landlord.FullName == "" || a.Tenant.FullName == "" || a.StartDate is null)
            throw new DomainException("Both parties and the owner's property details must be completed first.");

        return renderer.Render(new AgreementData(
            AgreementRules.TypeFor(c.Request.Details), DateOnly.FromDateTime(DateTime.UtcNow),
            AgreementRules.ToDto(a.Landlord, protector, false)!, AgreementRules.ToDto(a.Tenant, protector, false)!,
            AgreementRules.ToDto(a)!, c.Offer.Rent, c.Offer.Advance));
    }
}
