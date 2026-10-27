using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Talab.Api.Auth;
using Talab.Application;
using Talab.Application.Agreements;

namespace Talab.Api.Controllers;

/// <summary>Rental agreement draft for an accepted offer. Both parties fill in their part; the PDF is generated when complete.</summary>
[ApiController, Route("api/offers/{id:guid}/agreement"), Authorize(Roles = "Tenant,Owner")]
public class AgreementController(IDispatcher bus) : ControllerBase
{
    [HttpGet]
    public Task<AgreementDraft> Get(Guid id, CancellationToken ct) => bus.Ask(new GetAgreementQuery(User.Id(), id), ct);

    [HttpPut("party")]
    public Task<bool> SaveParty(Guid id, PartyDto p, CancellationToken ct) => bus.Send(new SavePartyCommand(User.Id(), id, p), ct);

    [HttpPut("terms")]
    public Task<bool> SaveTerms(Guid id, TermsDto t, CancellationToken ct) => bus.Send(new SaveTermsCommand(User.Id(), id, t), ct);

    [HttpGet("pdf")]
    public async Task<IActionResult> Pdf(Guid id, CancellationToken ct) =>
        File(await bus.Ask(new RenderAgreementQuery(User.Id(), id), ct), "application/pdf", "rent-agreement.pdf");
}
