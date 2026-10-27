using System.Security.Claims;
using System.Security.Cryptography;
using System.Threading.RateLimiting;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Talab.Api.Auth;
using Talab.Application;
using Talab.Application.Auth;
using Talab.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// production logs as JSON lines, easy for a log collector to read
if (!builder.Environment.IsDevelopment()) builder.Logging.AddJsonConsole();

// Behind a reverse proxy (nginx, IIS, a load balancer) the real client address and https come from X-Forwarded-* headers.
// Only trust them when told to (Proxy:Trust=true), because anyone can send those headers directly to an exposed API.
var trustProxy = builder.Configuration.GetValue<bool>("Proxy:Trust");
if (trustProxy)
    builder.Services.Configure<ForwardedHeadersOptions>(o =>
    {
        o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        o.KnownNetworks.Clear();
        o.KnownProxies.Clear();
    });

// Limits against guessing, abuse and runaway clients. Counted per person once signed in, per address before that.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await ctx.HttpContext.Response.WriteAsJsonAsync(new { error = "Too many attempts. Please wait a minute and try again." }, ct);
    };
    string Who(HttpContext h) => h.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? h.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    int Limit(string key, int fallback) => builder.Configuration.GetValue(key, fallback);
    o.AddPolicy("auth", h => RateLimitPartition.GetFixedWindowLimiter(Who(h), _ => new() { PermitLimit = Limit("RateLimit:AuthPerMinute", 10), Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("upload", h => RateLimitPartition.GetFixedWindowLimiter(Who(h), _ => new() { PermitLimit = Limit("RateLimit:UploadsPer10Min", 5), Window = TimeSpan.FromMinutes(10) }));
    o.AddPolicy("chat", h => RateLimitPartition.GetFixedWindowLimiter(Who(h), _ => new() { PermitLimit = Limit("RateLimit:MessagesPerMinute", 60), Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddControllers().AddJsonOptions(o =>
    o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddOpenApi();
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddSingleton<ITokenService, TokenService>();
builder.Services.AddSingleton<IAdminList, AdminList>();
builder.Services.AddSingleton<GoogleVerifier>();
builder.Services.AddSingleton<Talab.Api.Email.ChannelEmailQueue>();
builder.Services.AddSingleton<Talab.Application.Notifications.IEmailQueue>(sp => sp.GetRequiredService<Talab.Api.Email.ChannelEmailQueue>());
if (string.IsNullOrEmpty(builder.Configuration["Smtp:Host"])) builder.Services.AddSingleton<Talab.Api.Email.IEmailSender, Talab.Api.Email.LogEmailSender>();
else builder.Services.AddSingleton<Talab.Api.Email.IEmailSender, Talab.Api.Email.SmtpEmailSender>();
builder.Services.AddHostedService<Talab.Api.Email.EmailWorker>();
builder.Services.AddSignalR();
builder.Services.AddSingleton<Talab.Api.Realtime.PresenceTracker>();
builder.Services.AddSingleton<Talab.Application.Realtime.IRealtime, Talab.Api.Realtime.SignalRRealtime>();
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Configuration["Storage:Path"] ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data"), "keys")));
builder.Services.AddSingleton<Talab.Application.Verification.IFileStore, Talab.Api.Storage.EncryptedFileStore>();
builder.Services.AddSingleton<Talab.Application.Agreements.ISecretProtector, SecretProtector>();

// If Jwt:Key is missing, validation uses a random key so no token is ever accepted (and TokenService refuses to issue).
var jwtKey = builder.Configuration["Jwt:Key"] is { Length: >= 32 } k ? k : Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = "talab", ValidAudience = "talab",
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ClockSkew = TimeSpan.FromMinutes(1),
    };
    // browsers cannot set headers on a WebSocket, so SignalR sends the token in the query string (hub path only)
    o.Events = new JwtBearerEvents
    {
        OnMessageReceived = ctx =>
        {
            if (ctx.Request.Path.StartsWithSegments("/hubs") && ctx.Request.Query["access_token"] is { Count: > 0 } t) ctx.Token = t;
            return Task.CompletedTask;
        },
    };
});
builder.Services.AddAuthorization();

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// refuse to start with unsafe production settings, with a clear list of what to fix
if (!app.Environment.IsDevelopment())
{
    var check = Talab.Api.Startup.StartupChecks.Run(app.Configuration);
    foreach (var w in check.Warnings) app.Logger.LogWarning("Configuration: {Warning}", w);
    if (check.Errors.Count > 0)
        throw new InvalidOperationException("The app cannot start, fix these settings:\n - " + string.Join("\n - ", check.Errors));
    app.UseHsts();
}
if (trustProxy) app.UseForwardedHeaders();

if (app.Configuration.GetValue<bool>("Database:Migrate"))
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<AppDb>().Database.Migrate();
}

app.UseExceptionHandler(e => e.Run(async ctx =>
{
    var ex = ctx.Features.Get<IExceptionHandlerFeature>()?.Error;
    ctx.Response.StatusCode = ex is DomainException ? 409 : 500;
    await ctx.Response.WriteAsJsonAsync(new { error = ex is DomainException ? ex.Message : "Something went wrong." });
}));

if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    if (ctx.Request.Path.StartsWithSegments("/api")) ctx.Response.Headers.CacheControl = "no-store"; // signed-in data must not sit in shared caches
    await next();
});

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();
app.MapHub<Talab.Api.Realtime.AppHub>("/hubs/app");
app.MapGet("/health", () => Results.Ok(new { status = "ok" })); // alive

// ready: the database answers and every migration has been applied. Use this for container/load balancer checks.
app.MapGet("/health/ready", async (AppDb db, CancellationToken ct) =>
{
    try
    {
        if (!await db.Database.CanConnectAsync(ct)) return Results.Json(new { status = "database unreachable" }, statusCode: 503);
        var pending = (await db.Database.GetPendingMigrationsAsync(ct)).Count();
        return pending == 0 ? Results.Ok(new { status = "ready" }) : Results.Json(new { status = "migrations pending", pending }, statusCode: 503);
    }
    catch { return Results.Json(new { status = "database error" }, statusCode: 503); }
});

app.Run();
