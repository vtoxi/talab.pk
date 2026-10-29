using Microsoft.AspNetCore.DataProtection;
using Talab.Application.Verification;

namespace Talab.Api.Storage;

/// <summary>
/// Stores files on disk, encrypted with Data Protection. Keys are random GUIDs (never the user's file name).
/// ponytail: local disk; move to S3/Azure Blob behind IFileStore when running on more than one server.
/// </summary>
public class EncryptedFileStore(IDataProtectionProvider provider, IConfiguration cfg, IWebHostEnvironment env) : IFileStore
{
    private readonly IDataProtector p = provider.CreateProtector("talab.files.v1");
    private string Dir => Path.GetFullPath(Path.Combine(cfg["Storage:Path"] ?? Path.Combine(env.ContentRootPath, "App_Data"), "uploads"));

    private string PathFor(string key)
    {
        if (!Guid.TryParseExact(key, "N", out _)) throw new ArgumentException("Bad file key.");
        return Path.Combine(Dir, key + ".bin");
    }

    public async Task<string> Save(byte[] bytes, CancellationToken ct)
    {
        Directory.CreateDirectory(Dir);
        var key = Guid.NewGuid().ToString("N");
        await File.WriteAllBytesAsync(PathFor(key), p.Protect(bytes), ct);
        return key;
    }

    public async Task<byte[]?> Read(string key, CancellationToken ct) =>
        File.Exists(PathFor(key)) ? p.Unprotect(await File.ReadAllBytesAsync(PathFor(key), ct)) : null;

    public Task Delete(string key, CancellationToken ct)
    {
        if (File.Exists(PathFor(key))) File.Delete(PathFor(key));
        return Task.CompletedTask;
    }
}
