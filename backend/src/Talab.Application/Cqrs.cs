using Microsoft.Extensions.DependencyInjection;

namespace Talab.Application;

public interface ICommand<TResult>;
public interface IQuery<TResult>;

public interface ICommandHandler<in TCommand, TResult> where TCommand : ICommand<TResult>
{
    Task<TResult> Handle(TCommand command, CancellationToken ct);
}

public interface IQueryHandler<in TQuery, TResult> where TQuery : IQuery<TResult>
{
    Task<TResult> Handle(TQuery query, CancellationToken ct);
}

/// <summary>Business rule broken; API maps it to 409/400.</summary>
public class DomainException(string message) : Exception(message);

public interface IDispatcher
{
    Task<TResult> Send<TResult>(ICommand<TResult> command, CancellationToken ct = default);
    Task<TResult> Ask<TResult>(IQuery<TResult> query, CancellationToken ct = default);
}

public class Dispatcher(IServiceProvider sp) : IDispatcher
{
    public Task<TResult> Send<TResult>(ICommand<TResult> command, CancellationToken ct = default) =>
        Invoke<TResult>(typeof(ICommandHandler<,>), command, ct);

    public Task<TResult> Ask<TResult>(IQuery<TResult> query, CancellationToken ct = default) =>
        Invoke<TResult>(typeof(IQueryHandler<,>), query, ct);

    private Task<TResult> Invoke<TResult>(Type open, object message, CancellationToken ct)
    {
        var type = open.MakeGenericType(message.GetType(), typeof(TResult));
        dynamic handler = sp.GetRequiredService(type);
        return handler.Handle((dynamic)message, ct);
    }
}
