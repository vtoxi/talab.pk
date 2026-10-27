using Microsoft.AspNetCore.DataProtection;
using Talab.Application.Agreements;

namespace Talab.Api.Auth;

/// <summary>
/// Encrypts CNIC numbers with ASP.NET Data Protection. In production persist the key ring
/// (e.g. PersistKeysToFileSystem on a mounted volume): losing the keys makes stored CNICs unreadable.
/// </summary>
public class SecretProtector(IDataProtectionProvider provider) : ISecretProtector
{
    private readonly IDataProtector p = provider.CreateProtector("talab.cnic.v1");
    public string Protect(string plain) => p.Protect(plain);
    public string Unprotect(string protectedText) => protectedText == "" ? "" : p.Unprotect(protectedText);
}
