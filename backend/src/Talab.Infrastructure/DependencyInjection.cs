using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Talab.Application;

namespace Talab.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Database:Provider = "SqlServer" | "Postgres" (appsettings or env Database__Provider).</summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection s, IConfiguration cfg)
    {
        var cs = cfg.GetConnectionString("Default");
        var provider = cfg["Database:Provider"] ?? "Postgres";

        s.AddDbContext<AppDb>(o => _ = provider switch
        {
            // each provider keeps its own migrations in its own project (the SQL differs per database)
            "SqlServer" => o.UseSqlServer(cs, x => x.UseNetTopologySuite().MigrationsAssembly("Talab.Migrations.SqlServer")),
            "Postgres" => o.UseNpgsql(cs, x => x.UseNetTopologySuite().MigrationsAssembly("Talab.Migrations.Postgres")),
            _ => throw new InvalidOperationException($"Unknown Database:Provider '{provider}'"),
        });
        s.AddScoped<IAppDb>(sp => sp.GetRequiredService<AppDb>());
        s.AddSingleton<Talab.Application.Agreements.IAgreementRenderer, Pdf.AgreementPdf>();
        return s;
    }
}
