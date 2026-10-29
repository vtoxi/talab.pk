namespace Talab.Domain.Entities;

/// <summary>One person's details as they appear on the agreement. CNIC is stored encrypted.</summary>
public class PartyInfo
{
    public string FullName { get; set; } = "";
    public string FatherName { get; set; } = "";
    public string CnicProtected { get; set; } = "";
    public string Address { get; set; } = "";
    public string Phone { get; set; } = "";
}

/// <summary>Draft agreement for an accepted offer. Rent and advance are not stored here: they come from the offer.</summary>
public class Agreement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OfferId { get; set; }

    public PartyInfo Landlord { get; set; } = new();
    public PartyInfo Tenant { get; set; } = new();

    // property and terms (filled by the owner)
    public string City { get; set; } = "";
    public string PropertyAddress { get; set; } = "";
    public string PropertyDetails { get; set; } = "";
    public DateOnly? StartDate { get; set; }
    public int TermMonths { get; set; }
    public decimal AnnualIncreasePercent { get; set; }
    public int NoticeDays { get; set; } = 30;
    public string UtilitiesNote { get; set; } = "";

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
