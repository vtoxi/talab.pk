# RentOrBuy — Design Spec (v1)

Reverse rental marketplace for Pakistan: tenants post one requirement drawn on a map; verified owners respond with offers and negotiate in-app. Tenants are free.

## 1. Scope
- **Market:** Pakistan; launch Islamabad/Rawalpindi, then major cities.
- **Categories at launch:** property only, all types (flat, house, room, shop, office, land). `category` + `details` JSON on requests makes cars etc. a later config change.
- **Roles:** `tenant`, `owner`, `admin`, `agent`. `agent` is built but gated by the `agents_enabled` flag (default OFF).
- **Languages:** English and Urdu (RTL) both at launch; i18n from day one.
- **Out of scope v1:** automated payments, agents (flag off), cars, native apps, in-app rent payments.

## 2. Stack
- **Frontend:** Angular PWA, Angular Material, Leaflet + leaflet-draw on OSM tiles (commercial tile provider or self-hosted; not the public OSM server in production).
- **Backend:** ASP.NET Core Web API, EF Core, PostgreSQL + PostGIS (Npgsql NetTopologySuite).
- **Auth:** Google sign-in; API validates the Google ID token and issues its own JWT. No OTP/SMS.
- **Realtime:** SignalR (chat, in-app notifications).
- **Files:** S3-compatible/Azure Blob private storage, signed URLs (CNIC, photos).
- **Jobs:** Hangfire (Postgres storage) for notification fan-out, expiry, reminders.
- **Email:** transactional provider (Brevo/SES/Resend), SPF/DKIM.
- **PDF:** QuestPDF (or equivalent) with Urdu font support.
- **Hosting:** containerised; VPS or Azure App Service + managed Postgres.

## 3. Data model
- `users` (google_sub, email, role, verification_status, city)
- `owner_verifications` (cnic_front/back/selfie paths, status, reviewed_by)
- `owner_interests` (owner_id, city, category, optional saved property point)
- `requests` (tenant_id, category, details jsonb, budget_min/max, move_in_date, area geometry(Polygon), status open/found/expired, expires_at). **Partial unique index: one `open` request per tenant.** Circle stored as polygon plus centre/radius.
- `offers` (request_id, owner_id, location point, rent, advance, available_date, photos, note, status). **Point must satisfy ST_Contains(request.area, point).**
- `comments` (public, on request) and `messages` (private thread per offer)
- `counter_offers` (offer_id, by, rent, advance, date)
- `agreements` (offer_id, type residential/commercial, language, field data jsonb, pdf path)
- `credit_ledger`, `payments` (amount, method, screenshot, status, approved_by), `subscriptions`
- `notifications` (user_id, type, payload, read_at, dedupe_key unique)
- `reports`, `feature_flags` (key, enabled)

## 4. Core flows
1. **Tenant:** Google login → draw polygon/circle → fill details → post (free). Expires in 30 days; renew or close as "found".
2. **Owner:** login → CNIC + selfie upload → admin approves → browse matching requests → send offer (spends credit; some free offers/month).
3. **Notification on new request (job):** select owners where (saved property point ∈ area) OR (opted into city+category); insert in-app notification (deduped), push via SignalR, queue email (instant or daily digest per owner preference; unsubscribe link). Never "all owners".
4. **Negotiation:** private chat per offer + structured counter-offers. Phone numbers hidden until tenant presses Accept.
5. **Accept:** generate agreement PDF and police-registration data sheet; both sides confirm fields; download; user takes to stamp paper/police station.
6. **Abuse:** rate limits, report/block, admin queue, duplicate-offer detection.

## 5. Revenue (hypotheses to validate with ~10 real owners)
- Tenant: free.
- Owner: N free offers/month, then credit packs or monthly unlimited plan.
- Agreement fee per document.
- Later: agent plans (flag), boosted offers, lawyer-reviewed agreements.
- **Payments v1:** manual (JazzCash/Easypaisa/bank transfer + screenshot, admin approves). Gateway in v1.1.

## 6. Feature flags
`feature_flags` table, admin-editable, cached. `agents_enabled=false`: agent registration and plans hidden, API rejects agent actions. Toggling needs no deploy.

## 7. Agreement structure (draft for lawyer review)
Residential and commercial variants, English + Urdu.
1. Title, date/place, stamp paper reference
2. Parties: name, father/husband name, CNIC, address, phone
3. Property: address, type, floor, area, fixtures (inventory annexure)
4. Term: start, duration, renewal
5. Rent: amount, due date, mode, annual increase
6. Security deposit/advance and refund conditions
7. Utilities, taxes, maintenance charges
8. Permitted use; no subletting
9. Repairs: minor (tenant) vs major (landlord)
10. Landlord inspection with notice
11. Termination: notice periods, early-termination grounds
12. Handover and restoration
13. Police registration undertakings
14. Dispute resolution/jurisdiction; applicable law: Islamabad Rent Restriction Ordinance 2001 (ICT), Punjab Rented Premises Act 2009 (Punjab) — lawyer to confirm
15. Two witnesses with CNIC
16. Signatures/thumb impressions
17. Annexures: CNIC copies, photos, inventory, utility bill

Lawyer confirms wording, stamp duty and registration thresholds (leases over one year) per city. The product fills fields; it gives no legal advice and does not claim "police verified".

## 8. Security and privacy
CNIC images in private storage, encrypted at rest, access logged, admin-only; retention policy. Terms, privacy policy, platform-not-agent disclaimer. PECA 2016 aware. Minimal data stored.

## 9. Phasing
- **v1:** everything above except automated payments and agents.
- **v1.1:** gateway payments, web push, per-city police-registration helper.
- **v2:** agents (flag on), cars category, lawyer-review add-on, native app.

## 10. Risks
Off-platform deals (mitigated by hidden phones); fake owners (CNIC review, reports); cold start (seed demand first via FB groups, universities, HR desks); dealer willingness to pay (validate before pricing); legal challenge to template (lawyer review before launch).

## 11. Success metrics
Requests posted, offers per request, time to first offer, % closed as "found", owner paid conversion.
