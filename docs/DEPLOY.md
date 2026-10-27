# Deploying Talab

Two ways to run it. Pick one.

| | **A. Docker** | **B. IIS (Web Deploy) + FTP** |
|---|---|---|
| Backend | container | `scripts/deploy.ps1` publishes to IIS |
| Frontend | container (nginx) | `scripts/deploy.ps1` uploads over FTP |
| Database | Postgres container, or SQL Server | your SQL Server or Postgres |
| Best when | you control a server | you have Windows hosting |

Before either: **run the checks** (below), and set up the four things in "One-time setup".

---

## One-time setup

1. **Google sign-in.** Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* → *Web application*. Under **Authorized JavaScript origins** add your site address (for example `https://talab.pk`). Copy the client ID: it is `GOOGLE_CLIENT_ID` / `Google:ClientId`.
2. **Map tiles.** The public OpenStreetMap server must not be used for real traffic. Use a tile provider (for example MapTiler, Stadia Maps, or Thunderforest, each has a free tier; check current limits and terms) or run your own tile server from an OpenStreetMap extract of Pakistan. Put the provider's URL in `TILE_URL` (it contains `{z}/{x}/{y}` and usually a key; restrict the key to your domain in the provider's dashboard) and their credit line in `TILE_ATTRIBUTION`.
3. **Secrets.** `JWT_KEY` must be random and at least 32 characters: `python -c "import secrets;print(secrets.token_hex(32))"`. Changing it later signs everyone out.
4. **Email (recommended).** Any SMTP service. Without `SMTP_HOST`, emails are only written to the log.

The API **refuses to start** outside Development if a required setting is missing or unsafe, and lists exactly what to fix.

---

## A. Docker

```bash
cp .env.example .env      # fill in every REQUIRED value
docker compose up -d --build
```

* Only the `web` container is published (`WEB_PORT`, default 8081). Put TLS in front of it (Caddy, nginx, a load balancer) and forward `X-Forwarded-Proto`.
* The API applies database migrations when it starts (`Database__Migrate=true`). Run **one** API container, or switch to the SQL scripts (below).
* Data lives in three volumes: `pgdata` (database), `apidata` (**uploaded CNIC photos and the encryption keys**) and `mssqldata`. See Backups.
* Health: `GET /healthz` is 200 only when the database answers and all migrations are applied. Point your uptime monitor at it.
* **Prove it works** once Docker is running: `.\scripts\verify-docker.ps1` builds everything with throw-away secrets, applies the Postgres migrations, runs ten checks and removes it again.

SQL Server instead of Postgres: set `DB_PROVIDER=SqlServer` and `DB_CONNECTION` in `.env`, run with `--profile mssql`.

---

## B. IIS (Web Deploy) + FTP

### Server, once
* Windows Server with IIS, the **ASP.NET Core Hosting Bundle** for .NET 10, and the IIS feature **WebSocket Protocol** (needed for live chat and notifications).
* Web Deploy (MSDeploy) enabled, with a deploy user.
* A site for the API, with an app pool set to *No Managed Code*.
* A folder **outside the site folder** for data, for example `D:\TalabData`, with Modify permission for the app pool identity. This holds the uploaded CNIC photos and the encryption keys, so deployments never touch it.
* The frontend host needs the SPA fallback rule: `web.config` (IIS URL Rewrite module) or `.htaccess` (Apache) are already in the build.

### Settings on the API site
Set these as environment variables of the IIS site (or in `appsettings.Production.json` kept only on the server):

| Setting | Value |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `Database__Provider` | `SqlServer` or `Postgres` |
| `ConnectionStrings__Default` | your database connection string |
| `Jwt__Key` | random, 32+ characters |
| `Google__ClientId` | from setup step 1 |
| `Admin__Emails__0` | the first admin's Google email |
| `Cors__Origins__0` | the frontend address, for example `https://talab.pk` (add more with `__1`, `__2`) |
| `App__BaseUrl` | the frontend address (links in emails) |
| `Storage__Path` | `D:\TalabData` |
| `Smtp__Host`, `Smtp__Port`, `Smtp__User`, `Smtp__Password`, `Smtp__From` | your email service |
| `Database__Migrate` | `true` to let the app create/update tables at start-up, or leave off and use the SQL scripts |

IIS passes the real client address and https to the app itself, so leave `Proxy__Trust` off there.

### Deploy
```powershell
copy scripts\deploy.config.example.ps1 scripts\deploy.config.ps1   # fill it in; it is git-ignored
.\scripts\deploy.ps1                 # preflight, then backend, then frontend
.\scripts\deploy.ps1 -Backend        # or just one side
```
The script runs the preflight checks first and stops if any fail, takes the app offline during the file copy, waits for `/health/ready`, writes the frontend's `config.json` from your settings, uploads `index.html` last, and confirms the live site serves the new settings.

### Database migrations
* **Automatic:** `Database__Migrate=true`, and the app applies them at start-up.
* **By hand:** `.\scripts\migration-script.ps1` writes `artifacts\migrate-sqlserver.sql` and `artifacts\migrate-postgres.sql`. They are idempotent (safe to run more than once), so give them to your DBA or run them with `sqlcmd` / `psql` before deploying.

---

## The checks

| Command | Proves |
|---|---|
| `.\scripts\preflight.ps1` | builds, no known vulnerable packages, 41 unit tests, both databases' migrations match the code, frontend builds, no untranslated Urdu strings, and your deploy settings are sane |
| `.\scripts\verify-docker.ps1` | the images build and the whole stack works like production (needs Docker) |
| `NODE_PATH=frontend/node_modules node scripts/realtime-smoke-test.cjs` | live updates end to end (needs a running dev API and an empty dev database) |

## Settings reference (frontend)

Read from `/config.json` at start-up, not compiled in, so one build serves every environment. Docker writes it from environment variables; `deploy.ps1` writes it from `deploy.config.ps1`.

| Docker variable | `config.json` key | Meaning |
|---|---|---|
| `API_URL` | `apiUrl` | where the API lives; empty when the same site serves both |
| `GOOGLE_CLIENT_ID` | `googleClientId` | Google sign-in |
| `TILE_URL` | `tileUrl` | map tiles |
| `TILE_ATTRIBUTION` | `tileAttribution` | credit line the tile provider requires |
| `TILE_MAX_ZOOM` | `tileMaxZoom` | highest zoom the provider serves |

---

## Operating it

**Back up two things, together.** (1) the database; (2) the data folder / `apidata` volume (`Storage__Path`). The photos in it are encrypted with keys stored beside them: **a backup of the photos without the keys, or the other way round, cannot be restored.**

**Limits to know about**
* Live updates and "who is online" are held in the API's memory. With more than one API server you need a SignalR Redis backplane and a shared presence store.
* Emails wait in memory before sending, so a restart can drop a few. Use a database outbox if that matters.
* Sign-in, uploads and chat are rate limited per person/address (`RateLimit__*` settings).
* Admin has no audit log of who viewed which CNIC photo yet.

**Not verified on the developer machine** (Docker was not running there): building the Docker images, applying the Postgres migrations to a real Postgres, and the container health checks. Run `scripts/verify-docker.ps1` before the first real deploy. The SQL Server migrations, the API hardening, the runtime configuration and the unit tests were all run.
