using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Talab.Api.Auth;
using Talab.Application;
using Talab.Application.Owner;

namespace Talab.Api.Controllers;

[ApiController, Route("api/properties")]
public class PropertyController(IDispatcher bus, IAppDb db, IWebHostEnvironment env, IConfiguration cfg) : ControllerBase
{
    private string ImageDir
    {
        get
        {
            var basePath = cfg["Storage:Path"] ?? Path.Combine(env.ContentRootPath, "App_Data");
            var dir = Path.Combine(basePath, "property_images");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    [HttpPost("{pinId:guid}/image"), Authorize(Roles = "Owner"), RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> UploadImage(Guid pinId, IFormFile file, CancellationToken ct)
    {
        if (file.Length is <= 0 or > 10_000_000)
            return BadRequest(new { error = "Image must be under 10 MB." });

        var pins = await bus.Ask(new ListPinsQuery(User.Id()), ct);
        if (!pins.Any(p => p.Id == pinId)) return Forbid();

        var path = Path.Combine(ImageDir, $"{pinId:N}.jpg");
        await using var stream = new FileStream(path, FileMode.Create);
        await file.CopyToAsync(stream, ct);

        return Ok(new { url = $"/api/properties/{pinId:N}/image" });
    }

    [HttpGet("{pinId:guid}/image"), AllowAnonymous]
    public IActionResult GetImage(Guid pinId)
    {
        var path = Path.Combine(ImageDir, $"{pinId:N}.jpg");
        if (!System.IO.File.Exists(path)) return NotFound();
        Response.Headers.CacheControl = "public,max-age=86400";
        return PhysicalFile(path, "image/jpeg");
    }

    [HttpGet("offer/{offerId:guid}/image"), AllowAnonymous]
    public async Task<IActionResult> GetOfferImage(Guid offerId, CancellationToken ct)
    {
        var offer = await db.Offers.AsNoTracking().FirstOrDefaultAsync(o => o.Id == offerId, ct);
        if (offer == null) return NotFound();

        // Match owner's pin at the offer's location
        var pin = await db.OwnerPins.AsNoTracking()
            .Where(p => p.OwnerId == offer.OwnerId && p.Location.Distance(offer.Location) < 0.0001)
            .OrderBy(p => p.Location.Distance(offer.Location))
            .FirstOrDefaultAsync(ct);

        if (pin != null)
        {
            var pinPath = Path.Combine(ImageDir, $"{pin.Id:N}.jpg");
            if (System.IO.File.Exists(pinPath))
            {
                Response.Headers.CacheControl = "public,max-age=86400";
                return PhysicalFile(pinPath, "image/jpeg");
            }
        }

        return NotFound();
    }
}
