namespace Talab.Api.Startup;

/// <summary>
/// Fail-fast configuration check, run outside Development. A wrong setting stops the app at start-up with a clear
/// list of what to fix, instead of failing for users later (or running with an unsafe default).
/// </summary>
public static class StartupChecks
{
    public record Result(List<string> Errors, List<string> Warnings);

    public static Result Run(IConfiguration c)
    {
        var errors = new List<string>();
        var warnings = new List<string>();

        var key = c["Jwt:Key"] ?? "";
        if (key.Length < 32) errors.Add("Jwt:Key must be a random secret of at least 32 characters.");
        else if (key.Contains("dev-only", StringComparison.OrdinalIgnoreCase)) errors.Add("Jwt:Key is still the development key. Generate a new random secret.");

        if (string.IsNullOrWhiteSpace(c.GetConnectionString("Default"))) errors.Add("ConnectionStrings:Default is not set.");
        if ((c["Database:Provider"] ?? "Postgres") is not ("Postgres" or "SqlServer")) errors.Add("Database:Provider must be Postgres or SqlServer.");

        if (c.GetValue<bool>("Auth:DevLogin")) errors.Add("Auth:DevLogin must be off outside Development (it signs anyone in by email).");
        if (string.IsNullOrWhiteSpace(c["Google:ClientId"])) errors.Add("Google:ClientId is not set, so nobody can sign in.");
        if (c.GetSection("Admin:Emails").Get<string[]>() is not { Length: > 0 }) errors.Add("Admin:Emails is empty, so nobody could use the admin panel.");

        var origins = c.GetSection("Cors:Origins").Get<string[]>() ?? [];
        if (origins.Length == 0) warnings.Add("Cors:Origins is empty: only a front end on the same site as the API will work.");
        foreach (var o in origins)
        {
            if (o == "*" || !Uri.TryCreate(o, UriKind.Absolute, out var u) || (u.Scheme != "http" && u.Scheme != "https"))
                errors.Add($"Cors:Origins entry '{o}' must be a full address like https://talab.pk (no wildcards).");
            else if (u.Scheme == "http" && !u.IsLoopback)
                errors.Add($"Cors:Origins entry '{o}' must use https.");
        }

        if (string.IsNullOrWhiteSpace(c["Smtp:Host"])) warnings.Add("Smtp:Host is not set: emails are only written to the log.");
        if (!(c["App:BaseUrl"] ?? "").StartsWith("https://")) warnings.Add("App:BaseUrl is not an https address: links in emails will be wrong.");

        var storage = c["Storage:Path"];
        if (string.IsNullOrWhiteSpace(storage))
            warnings.Add("Storage:Path is not set: uploads and the encryption keys go under the app folder, which is lost when a container is replaced. Mount a persistent volume and set it.");
        else
        {
            try
            {
                Directory.CreateDirectory(storage);
                var probe = Path.Combine(storage, $".write-test-{Guid.NewGuid():N}");
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
            }
            catch (Exception e) { errors.Add($"Storage:Path '{storage}' is not writable: {e.Message}"); }
        }

        return new Result(errors, warnings);
    }
}
