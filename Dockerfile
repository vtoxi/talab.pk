# Stage 1: Build Angular frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npx ng build --configuration production

# Stage 2: Build .NET backend
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-build
WORKDIR /src
COPY backend/src/Talab.Domain/*.csproj Talab.Domain/
COPY backend/src/Talab.Application/*.csproj Talab.Application/
COPY backend/src/Talab.Infrastructure/*.csproj Talab.Infrastructure/
COPY backend/src/Talab.Migrations.Postgres/*.csproj Talab.Migrations.Postgres/
COPY backend/src/Talab.Migrations.SqlServer/*.csproj Talab.Migrations.SqlServer/
COPY backend/src/Talab.Api/*.csproj Talab.Api/
RUN dotnet restore Talab.Api/Talab.Api.csproj
COPY backend/src/ .
RUN dotnet publish Talab.Api/Talab.Api.csproj -c Release -o /out --no-restore

# Stage 3: Final Runtime Image
FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update && apt-get install -y --no-install-recommends libfontconfig1 curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend-build /out .
COPY --from=frontend-build /app/dist/talab-web/browser ./wwwroot

# Production defaults
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    Database__Provider=Postgres \
    Database__Migrate=true \
    Storage__Path=/data \
    Proxy__Trust=true \
    Jwt__Key=c9d084f7b2a61e5e8f4c2d3a9b1c7e5f8a4d2c6e1b9f7a5d3c8e2b4a6d8c1e7f

RUN mkdir -p /data && chown -R $APP_UID /data
VOLUME /data
USER $APP_UID
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 CMD curl -fsS http://localhost:8080/health || exit 1
ENTRYPOINT ["dotnet", "Talab.Api.dll"]
