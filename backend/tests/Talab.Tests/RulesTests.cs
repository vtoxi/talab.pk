using Talab.Application;
using Talab.Application.Agreements;
using Talab.Application.Notifications;
using Talab.Application.Verification;
using Xunit;

namespace Talab.Tests;

public class CnicAndPhoneTests
{
    [Theory]
    [InlineData("61101-1234567-1", "6110112345671")]
    [InlineData("61101 1234567 1", "6110112345671")]
    [InlineData("6110112345671", "6110112345671")]
    public void Cnic_is_normalised_to_13_digits(string input, string expected) =>
        Assert.Equal(expected, AgreementRules.NormalizeCnic(input));

    [Theory]
    [InlineData("")]
    [InlineData("123")]
    [InlineData("61101-1234567")]          // 12 digits
    [InlineData("61101-1234567-12")]       // 14 digits
    [InlineData("abcde-fghijkl-m")]
    public void Bad_cnic_is_rejected_with_a_helpful_message(string input)
    {
        var e = Assert.Throws<DomainException>(() => AgreementRules.NormalizeCnic(input));
        Assert.Contains("13 digits", e.Message);
    }

    [Fact]
    public void Cnic_is_formatted_for_the_agreement_and_masked_for_the_other_party()
    {
        Assert.Equal("61101-1234567-1", AgreementRules.FormatCnic("6110112345671"));
        Assert.Equal("*****-*******-1", AgreementRules.MaskCnic("6110112345671"));
        Assert.DoesNotContain("1234567", AgreementRules.MaskCnic("6110112345671"));
    }

    [Theory]
    [InlineData("0300-1234567", "03001234567")]
    [InlineData("+92 321 5550123", "+923215550123")]
    public void Phone_numbers_are_cleaned(string input, string expected) => Assert.Equal(expected, AgreementRules.NormalizePhone(input));

    [Theory]
    [InlineData("12345")]
    [InlineData("call me")]
    public void Bad_phone_is_rejected(string input) => Assert.Throws<DomainException>(() => AgreementRules.NormalizePhone(input));

    [Theory]
    [InlineData("{\"type\":\"shop\"}", "Commercial")]
    [InlineData("{\"type\":\"office\"}", "Commercial")]
    [InlineData("{\"type\":\"flat\"}", "Residential")]
    [InlineData("not json", "Residential")]
    public void Agreement_type_follows_the_property_type(string details, string expected) =>
        Assert.Equal(expected, AgreementRules.TypeFor(details));
}

public class ImageRulesTests
{
    private static byte[] Png() => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];
    private static byte[] Jpeg() => [0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0];

    [Fact]
    public void Type_is_decided_by_the_file_contents_not_the_name()
    {
        Assert.Equal("image/png", ImageRules.Sniff(Png()));
        Assert.Equal("image/jpeg", ImageRules.Sniff(Jpeg()));
        Assert.Null(ImageRules.Sniff("<script>alert(1)</script>"u8.ToArray()));
        Assert.Null(ImageRules.Sniff("%PDF-1.7 not an image"u8.ToArray()));
    }

    [Fact]
    public void Empty_oversized_and_non_image_files_are_refused()
    {
        Assert.Throws<DomainException>(() => ImageRules.Check([], "selfie"));
        Assert.Throws<DomainException>(() => ImageRules.Check("hello hello hello"u8.ToArray(), "selfie"));
        var big = new byte[ImageRules.MaxBytes + 1];
        Png().CopyTo(big, 0);
        Assert.Throws<DomainException>(() => ImageRules.Check(big, "selfie"));
        ImageRules.Check(Png(), "selfie"); // fine
    }
}

public class NotificationTextTests
{
    [Fact]
    public void Placeholders_are_filled_in_one_pass()
    {
        var text = Texts.Fill("{name} suggested new terms", new Dictionary<string, string> { ["name"] = "Omar" });
        Assert.Equal("Omar suggested new terms", text);
    }

    [Fact]
    public void A_value_that_looks_like_a_placeholder_is_never_expanded()
    {
        // a chat message must not be able to pull in other values
        var args = new Dictionary<string, string> { ["preview"] = "hi {name}", ["name"] = "SECRET" };
        Assert.Equal("hi {name}", Texts.Fill("{preview}", args));
    }

    [Fact]
    public void Unknown_placeholders_and_missing_args_are_left_alone()
    {
        Assert.Equal("Hello {who}", Texts.Fill("Hello {who}", new Dictionary<string, string>()));
        Assert.Equal("Hello {who}", Texts.Fill("Hello {who}", null));
    }

    [Fact]
    public void Money_uses_plain_digits_with_thousands_separators() => Assert.Equal("Rs 95,000", Texts.Money(95000m));

    [Fact]
    public void Property_type_is_read_from_the_request_details()
    {
        Assert.Equal("house", Texts.TypeOf("{\"type\":\"house\"}"));
        Assert.Equal("property", Texts.TypeOf("broken"));
    }
}
