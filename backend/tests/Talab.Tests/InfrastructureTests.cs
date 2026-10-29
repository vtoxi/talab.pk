using System.Text;
using Microsoft.Extensions.Configuration;
using Talab.Api.Realtime;
using Talab.Api.Startup;
using Talab.Application.Agreements;
using Talab.Infrastructure.Pdf;
using Xunit;

namespace Talab.Tests;

public class StartupChecksTests
{
    private static IConfiguration Config(Dictionary<string, string?> values) => new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private static Dictionary<string, string?> Good(string storage) => new()
    {
        ["Jwt:Key"] = new string('k', 40) + "Zq9",
        ["ConnectionStrings:Default"] = "Host=db;Database=talab;Username=talab;Password=secret",
        ["Database:Provider"] = "Postgres",
        ["Google:ClientId"] = "abc.apps.googleusercontent.com",
        ["Admin:Emails:0"] = "founder@talab.pk",
        ["Cors:Origins:0"] = "https://talab.pk",
        ["Smtp:Host"] = "smtp.example.com",
        ["App:BaseUrl"] = "https://talab.pk",
        ["Storage:Path"] = storage,
    };

    private static string TempDir() => Path.Combine(Path.GetTempPath(), "talab-tests-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void A_complete_production_config_passes_with_no_warnings()
    {
        var r = StartupChecks.Run(Config(Good(TempDir())));
        Assert.Empty(r.Errors);
        Assert.Empty(r.Warnings);
    }

    [Theory]
    [InlineData("Jwt:Key", "too-short", "Jwt:Key")]
    [InlineData("Jwt:Key", "dev-only-key-change-me-0123456789abcdef0123456789", "development key")]
    [InlineData("Auth:DevLogin", "true", "DevLogin")]
    [InlineData("Database:Provider", "Oracle", "Database:Provider")]
    [InlineData("Cors:Origins:0", "http://talab.pk", "https")]
    [InlineData("Cors:Origins:0", "*", "wildcards")]
    [InlineData("Google:ClientId", "", "Google:ClientId")]
    [InlineData("ConnectionStrings:Default", "", "ConnectionStrings:Default")]
    public void Each_unsafe_setting_stops_the_app_with_a_clear_reason(string key, string value, string expectedInMessage)
    {
        var values = Good(TempDir());
        values[key] = value;
        var r = StartupChecks.Run(Config(values));
        Assert.Contains(r.Errors, e => e.Contains(expectedInMessage, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Missing_admin_emails_is_an_error_but_a_missing_smtp_host_is_only_a_warning()
    {
        var values = Good(TempDir());
        values.Remove("Admin:Emails:0");
        values.Remove("Smtp:Host");
        var r = StartupChecks.Run(Config(values));
        Assert.Contains(r.Errors, e => e.Contains("Admin:Emails"));
        Assert.Contains(r.Warnings, w => w.Contains("Smtp:Host"));
        Assert.DoesNotContain(r.Errors, e => e.Contains("Smtp"));
    }

    [Fact]
    public void An_unset_storage_path_warns_because_container_files_are_lost_on_redeploy()
    {
        var values = Good(TempDir());
        values.Remove("Storage:Path");
        var r = StartupChecks.Run(Config(values));
        Assert.Contains(r.Warnings, w => w.Contains("Storage:Path"));
    }
}

public class PresenceTrackerTests
{
    private static readonly Guid Offer = Guid.NewGuid();
    private static readonly Guid Tina = Guid.NewGuid(), Omar = Guid.NewGuid();

    [Fact]
    public void Each_side_sees_whether_the_other_is_in_the_room()
    {
        var p = new PresenceTracker();
        p.Join("c1", Tina, Offer);
        Assert.False(p.OtherOnline(Offer, Tina));
        Assert.True(p.OtherOnline(Offer, Omar));
        p.Join("c2", Omar, Offer);
        Assert.True(p.OtherOnline(Offer, Tina));
    }

    [Fact]
    public void Someone_with_two_tabs_stays_online_until_the_last_one_leaves()
    {
        var p = new PresenceTracker();
        p.Join("tab1", Tina, Offer);
        p.Join("tab2", Tina, Offer);
        Assert.False(p.Leave("tab1", Offer));   // still in via tab2
        Assert.True(p.OtherOnline(Offer, Omar));
        Assert.True(p.Leave("tab2", Offer));    // now gone
        Assert.False(p.OtherOnline(Offer, Omar));
    }

    [Fact]
    public void A_dropped_connection_leaves_every_room_it_was_in()
    {
        var p = new PresenceTracker();
        var other = Guid.NewGuid();
        p.Join("c1", Tina, Offer);
        p.Join("c1", Tina, other);
        var gone = p.LeaveAll("c1");
        Assert.Equal(2, gone.Count);
        Assert.False(p.IsIn("c1", Offer));
        Assert.Empty(p.LeaveAll("c1")); // already gone
    }

    [Fact]
    public void Typing_is_only_accepted_from_a_connection_inside_the_room()
    {
        var p = new PresenceTracker();
        p.Join("c1", Tina, Offer);
        Assert.True(p.IsIn("c1", Offer));
        Assert.False(p.IsIn("stranger", Offer));
        Assert.False(p.IsIn("c1", Guid.NewGuid()));
    }
}

public class AgreementPdfTests
{
    [Fact]
    public void A_complete_agreement_renders_a_real_pdf_with_every_part()
    {
        var landlord = new PartyDto("Omar Khan", "Ali Khan", "61101-1234567-1", "House 5, F-7/2, Islamabad", "03001234567");
        var tenant = new PartyDto("Tina Malik", "Zahid Malik", "37405-7654321-2", "House 22, G-9/1, Islamabad", "+923215550123");
        var terms = new TermsDto("Islamabad", "Flat 12, Al-Noor Plaza, F-7 Markaz", "2 bedrooms", new DateOnly(2026, 12, 5), 11, 10, 30, "");

        var pdf = new AgreementPdf().Render(new AgreementData("Residential", new DateOnly(2026, 10, 27), landlord, tenant, terms, 58000m, 116000m));

        Assert.True(pdf.Length > 5_000);
        Assert.Equal("%PDF-", Encoding.ASCII.GetString(pdf, 0, 5));
    }

    [Fact]
    public void Commercial_and_non_islamabad_agreements_also_render()
    {
        var p = new PartyDto("A B", "C D", "12345-1234567-1", "Address", "03001234567");
        var terms = new TermsDto("Other", "Shop 4, Main Market", "", new DateOnly(2027, 1, 1), 24, 0, 60, "Tenant pays all bills.");
        var pdf = new AgreementPdf().Render(new AgreementData("Commercial", new DateOnly(2026, 12, 20), p, p, terms, 120000m, 360000m));
        Assert.Equal("%PDF-", Encoding.ASCII.GetString(pdf, 0, 5));
    }
}
