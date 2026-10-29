using System.Threading.Channels;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using Talab.Application.Notifications;

namespace Talab.Api.Email;

public interface IEmailSender { Task Send(EmailMessage m, CancellationToken ct); }

/// <summary>Development fallback when Smtp:Host is not configured: writes the email to the log.</summary>
public class LogEmailSender(ILogger<LogEmailSender> log) : IEmailSender
{
    public Task Send(EmailMessage m, CancellationToken ct)
    {
        log.LogInformation("EMAIL (not sent, Smtp:Host unset) to {To}: {Subject} | {Body}", m.To, m.Subject, m.Body);
        return Task.CompletedTask;
    }
}

/// <summary>Config: Smtp:Host, Smtp:Port, Smtp:User, Smtp:Password, Smtp:From, Smtp:Tls (true = STARTTLS), App:BaseUrl.</summary>
public class SmtpEmailSender(IConfiguration cfg) : IEmailSender
{
    public async Task Send(EmailMessage m, CancellationToken ct)
    {
        var baseUrl = (cfg["App:BaseUrl"] ?? "http://localhost:4200").TrimEnd('/');
        var msg = new MimeMessage();
        msg.From.Add(MailboxAddress.Parse(cfg["Smtp:From"] ?? "Talab <no-reply@talab.pk>"));
        msg.To.Add(MailboxAddress.Parse(m.To));
        msg.Subject = m.Subject;
        msg.Body = new TextPart("plain")
        {
            Text = $"{m.Body}\n\nOpen Talab: {baseUrl}{m.Link}\n\nYou get this email because you use Talab. Turn emails off any time: {baseUrl}/notifications\n",
        };

        using var smtp = new SmtpClient();
        await smtp.ConnectAsync(cfg["Smtp:Host"], cfg.GetValue("Smtp:Port", 587),
            cfg.GetValue("Smtp:Tls", true) ? SecureSocketOptions.StartTls : SecureSocketOptions.None, ct);
        if (!string.IsNullOrEmpty(cfg["Smtp:User"])) await smtp.AuthenticateAsync(cfg["Smtp:User"], cfg["Smtp:Password"], ct);
        await smtp.SendAsync(msg, ct);
        await smtp.DisconnectAsync(true, ct);
    }
}

public class ChannelEmailQueue : IEmailQueue
{
    // ponytail: in-memory queue, emails are lost if the process restarts; use a DB outbox when that matters.
    public Channel<EmailMessage> Channel { get; } = System.Threading.Channels.Channel.CreateBounded<EmailMessage>(
        new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.DropOldest });

    public void Enqueue(EmailMessage m) => Channel.Writer.TryWrite(m);
}

public class EmailWorker(ChannelEmailQueue queue, IEmailSender sender, ILogger<EmailWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        await foreach (var m in queue.Channel.Reader.ReadAllAsync(stop))
            for (var attempt = 1; attempt <= 3; attempt++)
            {
                try { await sender.Send(m, stop); break; }
                catch (Exception e) when (!stop.IsCancellationRequested)
                {
                    log.LogWarning(e, "Email to {To} failed (attempt {Attempt}/3)", m.To, attempt);
                    await Task.Delay(TimeSpan.FromSeconds(5 * attempt), stop);
                }
            }
    }
}
