using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Talab.Application.Agreements;

namespace Talab.Infrastructure.Pdf;

/// <summary>
/// English rent agreement. DRAFT TEXT: the clauses follow the structure in the design spec and must be reviewed by a
/// lawyer (stamp duty, registration of leases over one year, ICT vs Punjab rent law) before real use.
/// An Urdu version needs lawyer-approved Urdu text and an embedded Urdu font; the data model is language-neutral.
/// </summary>
public class AgreementPdf : IAgreementRenderer
{
    static AgreementPdf() => QuestPDF.Settings.License = LicenseType.Community; // free below US$1M annual revenue

    static string Rs(decimal v) => "Rs " + v.ToString("N0", CultureInfo.InvariantCulture);
    static string D(DateOnly d) => d.ToString("dd MMMM yyyy", CultureInfo.InvariantCulture);

    static string Law(string city) => city switch
    {
        "Islamabad" => "the Islamabad Capital Territory Rent Restriction Ordinance, 2001 and other applicable laws of Pakistan",
        "Rawalpindi" or "Other Punjab" => "the Punjab Rented Premises Act, 2009 and other applicable laws of Pakistan",
        _ => "the laws of Pakistan applicable to the Premises",
    };

    static string Party(PartyDto p, string role) =>
        $"{p.FullName}, son/daughter/wife of {p.FatherName}, holder of CNIC No. {p.Cnic}, resident of {p.Address}, Phone {p.Phone} (the \"{role}\")";

    public byte[] Render(AgreementData d)
    {
        var t = d.Terms;
        var start = t.StartDate!.Value;
        var end = start.AddMonths(t.TermMonths).AddDays(-1);
        var commercial = d.Type == "Commercial";

        var clauses = new List<(string Head, string Body)>
        {
            ("Premises", $"The Landlord lets and the Tenant takes on rent the {d.Type.ToLower()} property situated at {t.PropertyAddress}" +
                (string.IsNullOrWhiteSpace(t.PropertyDetails) ? "" : $" ({t.PropertyDetails})") +
                " (the \"Premises\"), together with the fixtures and fittings listed in Annexure A."),
            ("Term", $"The tenancy begins on {D(start)} and continues for {t.TermMonths} month(s), ending on {D(end)}. It may be renewed only by a written agreement signed by both parties."),
            ("Rent", $"The monthly rent is {Rs(d.Rent)}, payable in advance on or before the 5th day of each calendar month."),
            ("Increase of rent", t.AnnualIncreasePercent > 0
                ? $"The rent shall increase by {t.AnnualIncreasePercent:0.##}% at the end of each year of the tenancy."
                : "The rent shall remain fixed for the whole term of this agreement."),
            ("Security deposit", $"The Tenant has paid or shall pay an advance of {Rs(d.Advance)} as security. It is refundable without interest at the end of the tenancy, after deducting lawful dues and the cost of damage beyond normal wear and tear."),
            ("Utilities and taxes", string.IsNullOrWhiteSpace(t.UtilitiesNote)
                ? "The Tenant shall pay electricity, gas, water, telephone and similar charges for the period of occupation. The Landlord shall pay property tax and ground rent."
                : t.UtilitiesNote),
            ("Use of the Premises", $"The Premises shall be used only for {(commercial ? "lawful commercial" : "residential")} purposes. The Tenant shall not sublet, assign or part with possession of the Premises, or use them for any unlawful activity."),
            ("Repairs", "The Tenant shall bear the cost of minor repairs and maintenance. The Landlord shall bear the cost of major and structural repairs not caused by the Tenant."),
            ("Inspection", "The Landlord may inspect the Premises at reasonable times after giving the Tenant reasonable notice."),
            ("Termination", $"Either party may end this agreement by giving {t.NoticeDays} days' written notice. The Landlord may also seek termination for non-payment of rent, misuse of the Premises or unauthorised subletting, as permitted by law."),
            ("Handover", "On the end of the tenancy the Tenant shall vacate and hand over vacant possession of the Premises in the same condition as received, normal wear and tear excepted."),
            ("Police registration", "The Landlord shall register the Tenant with the local police as required by law. The Tenant shall provide the documents and information needed. The Tenant's particulars are set out in Annexure B."),
            ("Governing law and disputes", $"This agreement is governed by {Law(t.City)}. Disputes shall be referred to the competent court or forum at {(t.City.StartsWith("Other") ? "the place where the Premises are situated" : t.City)}."),
            ("Entire agreement", "This agreement is the whole agreement between the parties. Any change must be in writing and signed by both parties. Each party has received a signed copy."),
        };

        return Document.Create(doc =>
        {
            doc.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(42);
                page.DefaultTextStyle(x => x.FontSize(10.5f).LineHeight(1.35f));

                page.Footer().Column(f =>
                {
                    f.Item().Text("DRAFT generated by Talab. This is not legal advice. Have a lawyer review it and print it on stamp paper of the value required by law.")
                        .FontSize(7.5f).FontColor(Colors.Grey.Darken1);
                    f.Item().AlignCenter().Text(x => { x.Span("Page ").FontSize(8); x.CurrentPageNumber().FontSize(8); x.Span(" of ").FontSize(8); x.TotalPages().FontSize(8); });
                });

                page.Content().Column(col =>
                {
                    col.Spacing(8);
                    col.Item().AlignCenter().Text("RENT AGREEMENT").Bold().FontSize(17);
                    col.Item().AlignCenter().Text($"({d.Type})").FontSize(11);
                    col.Item().PaddingTop(6).Text($"This Rent Agreement is made on {D(d.Date)} at {(t.City.StartsWith("Other") ? "Pakistan" : t.City)}.");

                    col.Item().Text(x => { x.Span("BETWEEN  ").Bold(); x.Span(Party(d.Landlord, "Landlord")); });
                    col.Item().Text(x => { x.Span("AND  ").Bold(); x.Span(Party(d.Tenant, "Tenant")); });
                    col.Item().Text("The parties agree as follows:");

                    for (var i = 0; i < clauses.Count; i++)
                        col.Item().Text(x => { x.Span($"{i + 1}. {clauses[i].Head}. ").Bold(); x.Span(clauses[i].Body); });

                    col.Item().PaddingTop(14).Text("SIGNED by the parties on the date written above.").Bold();
                    col.Item().Row(r =>
                    {
                        r.RelativeItem().Element(c => Signature(c, "LANDLORD", d.Landlord));
                        r.ConstantItem(20);
                        r.RelativeItem().Element(c => Signature(c, "TENANT", d.Tenant));
                    });

                    col.Item().PaddingTop(10).Text("WITNESSES").Bold();
                    col.Item().Row(r =>
                    {
                        r.RelativeItem().Element(Witness);
                        r.ConstantItem(20);
                        r.RelativeItem().Element(Witness);
                    });
                });
            });

            doc.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(42);
                page.DefaultTextStyle(x => x.FontSize(10.5f));
                page.Content().Column(col =>
                {
                    col.Spacing(8);
                    col.Item().Text("ANNEXURE A: INVENTORY OF FIXTURES AND FITTINGS").Bold().FontSize(12);
                    col.Item().Table(tbl =>
                    {
                        tbl.ColumnsDefinition(c => { c.RelativeColumn(4); c.RelativeColumn(1); c.RelativeColumn(3); });
                        foreach (var h in new[] { "Item", "Qty", "Condition" }) tbl.Cell().Background(Colors.Grey.Lighten3).Element(Cell).Text(h).Bold();
                        for (var i = 0; i < 10 * 3; i++) tbl.Cell().Element(Cell).Text(" ");
                    });

                    col.Item().PaddingTop(18).Text("ANNEXURE B: TENANT INFORMATION FOR POLICE REGISTRATION").Bold().FontSize(12);
                    col.Item().Text("Check the format required by the local police for your city and copy these details into it.").FontSize(9).FontColor(Colors.Grey.Darken1);
                    col.Item().Table(tbl =>
                    {
                        tbl.ColumnsDefinition(c => { c.RelativeColumn(2); c.RelativeColumn(3); });
                        void Row(string k, string v) { tbl.Cell().Element(Cell).Text(k).Bold(); tbl.Cell().Element(Cell).Text(v); }
                        Row("Tenant's name", d.Tenant.FullName);
                        Row("Father's / husband's name", d.Tenant.FatherName);
                        Row("CNIC", d.Tenant.Cnic);
                        Row("Present address", d.Tenant.Address);
                        Row("Phone", d.Tenant.Phone);
                        Row("Occupation / business", "");
                        Row("Number of persons staying", "");
                        Row("Landlord's name", d.Landlord.FullName);
                        Row("Landlord's CNIC", d.Landlord.Cnic);
                        Row("Landlord's phone", d.Landlord.Phone);
                        Row("Rented property", t.PropertyAddress);
                        Row("Rented from", D(start));
                        Row("Purpose", d.Type);
                    });

                    col.Item().PaddingTop(18).Text("ANNEXURE C: DOCUMENTS TO ATTACH").Bold().FontSize(12);
                    foreach (var s in new[] { "Copies of the CNIC of the Landlord, the Tenant and both witnesses.", "Recent passport-size photographs of the Landlord and the Tenant.",
                                              "Proof of ownership of the Premises, or the Landlord's authority to let them.", "A recent utility bill of the Premises." })
                        col.Item().Text("•  " + s);

                    col.Item().PaddingTop(18).Border(0.5f).Padding(8).Column(n =>
                    {
                        n.Item().Text("BEFORE YOU SIGN").Bold();
                        n.Item().Text("• Print this agreement on stamp paper of the value required in your city.");
                        n.Item().Text("• A tenancy longer than one year may need to be registered with the sub-registrar. Ask a lawyer.");
                        n.Item().Text("• Register the tenant with the police as required for your city.");
                    });
                });
            });
        }).GeneratePdf();
    }

    static IContainer Cell(IContainer c) => c.Border(0.5f).BorderColor(Colors.Grey.Medium).Padding(5);

    static void Signature(IContainer c, string title, PartyDto p) => c.Column(col =>
    {
        col.Item().Text(title).Bold();
        col.Item().Text(p.FullName);
        col.Item().PaddingTop(28).LineHorizontal(0.5f);
        col.Item().Text("Signature").FontSize(8).FontColor(Colors.Grey.Darken1);
        col.Item().PaddingTop(6).Width(60).Height(60).Border(0.5f).AlignCenter().AlignMiddle().Text("Thumb").FontSize(7).FontColor(Colors.Grey.Medium);
    });

    static void Witness(IContainer c) => c.Column(col =>
    {
        col.Item().Text("Name: ______________________________");
        col.Item().PaddingTop(4).Text("CNIC: ______________________________");
        col.Item().PaddingTop(20).LineHorizontal(0.5f);
        col.Item().Text("Signature").FontSize(8).FontColor(Colors.Grey.Darken1);
    });
}
