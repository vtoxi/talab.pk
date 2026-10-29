using Microsoft.Extensions.DependencyInjection;

namespace Talab.Application;

public static class DependencyInjection
{
    /// <summary>Registers the dispatcher and every command/query handler in this assembly.</summary>
    public static IServiceCollection AddApplication(this IServiceCollection s)
    {
        s.AddScoped<IDispatcher, Dispatcher>();
        s.AddScoped<Notifications.INotifier, Notifications.Notifier>();
        var handlerTypes = new[] { typeof(ICommandHandler<,>), typeof(IQueryHandler<,>) };
        foreach (var impl in typeof(DependencyInjection).Assembly.GetTypes().Where(t => t is { IsClass: true, IsAbstract: false }))
            foreach (var i in impl.GetInterfaces().Where(i => i.IsGenericType && handlerTypes.Contains(i.GetGenericTypeDefinition())))
                s.AddScoped(i, impl);
        return s;
    }
}
