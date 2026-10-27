FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# restore first, from the project files only, so this layer is cached until a package changes
COPY src/Talab.Domain/*.csproj Talab.Domain/
COPY src/Talab.Application/*.csproj Talab.Application/
COPY src/Talab.Infrastructure/*.csproj Talab.Infrastructure/
COPY src/Talab.Migrations.Postgres/*.csproj Talab.Migrations.Postgres/
COPY src/Talab.Migrations.SqlServer/*.csproj Talab.Migrations.SqlServer/
COPY src/Talab.Api/*.csproj Talab.Api/
RUN dotnet restore Talab.Api
COPY src/ .
RUN dotnet publish Talab.Api -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
# libfontconfig1: the PDF library needs it to find fonts; curl: used by the container health check
RUN apt-get update && apt-get install -y --no-install-recommends libfontconfig1 curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out .

# uploads (encrypted CNIC photos) and the encryption keys live here: mount a persistent volume on /data
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    Storage__Path=/data \
    Proxy__Trust=true
RUN mkdir -p /data && chown -R $APP_UID /data
VOLUME /data
USER $APP_UID
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 CMD curl -fsS http://localhost:8080/health/ready || exit 1
ENTRYPOINT ["dotnet", "Talab.Api.dll"]
