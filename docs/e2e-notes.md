# E2E running notes (scratch; the final report is docs/E2E-REPORT.md)
Start: fresh LocalDB (migrations), API :5080 Development, dev server :4200.
Baseline before UI run: realtime 30/30, unit tests 41/41.
## Tenant flow
- PASS landing (signed out) -> tenant tile -> sign-in (dev) -> /post (first sign-in call takes ~3-5 s: cold start of API, note)
- PASS wizard step 1 (type tiles), step 2 map: polygon drawn (needs mouse-move before click in automation only; app is fine)
- PASS wizard steps 3-4, send -> /my-request shows House Rs 80000-120000, Offers (0)
- PASS second request refused 409 "You already have an open request..."; tenant gets 403 on owner/admin APIs
- PASS guards: tenant -> /admin, /owner redirect to /; unknown URL -> / (no dedicated 404 page, minor)
- PASS user menu (email, role, My request, Post a request, Switch to owner, Sign out); sign-out clears session
## Owner flow
- PASS "I have something" -> sign-in -> /owner: new owner sees verify banner + empty-state + map
- PASS add place by tapping map + name -> feed shows tenant's House request "Matches your place: F-7 house" (spatial match works in UI)
- PASS unverified owner sends offer -> blocked with red message "Verify your account first..." (form keeps typed values). UX idea: add a link to /owner/verify in that message.
- PASS verification upload (3 images, previews) -> owner banner "documents being reviewed"
## Admin flow
- PASS sign in as admin@talab.pk -> /admin/dashboard: stats correct (3 users, 1 owner / 0 verified, 1 open request, 0 offers)
- BUG FIXED: my "centre page titles" CSS also hit the admin panel (subtitle looked indented). Scoped to .public-page.
- PASS admin Verifications queue shows pending owner (local time), Review page loads 3 private images (decrypted), reject requires reason
- PASS reject with reason -> pending queue empty, Rejected tab lists it; owner sees red banner with the exact reason + bell badge
- PASS owner resubmits (3 files) -> pending again; admin approves -> stats verifiedOwners=1
- minor: admin focus ring is the public green, not admin indigo
- FIXED admin users: verification badge only for owners/agents (tenants/admin showed a misleading 'Pending'); admin requests now show type (House) not 'Property'; admin focus ring indigo
- PASS admin Requests list + filter tabs; Users list; Settings switch toggles and persists (note: agents_enabled flag is stored but nothing reads it yet)
- GAP admin list pages show "No users found"/empty instead of an error when the API is unreachable (no error state)
## Offer / chat flow
- PASS owner sends offer via UI (verified owner) -> chat opens: header/title/deal strip/actions OK; Enter sends, Shift+Enter newline, multi-line preserved; ticks; day divider
- FIXED composer showed a scrollbar at 2 lines (overflow now hidden until max height)
- PASS tenant sees offer on My request (Offers (1), Waiting), bell badge 2 (offer + coalesced message), inbox lists both; tapping a notification opens the chat and clears the bell
- PASS tenant reply (Enter), counter 90000/180000 (deal strip updates), owner counter 92000/184000 (deal strip updates both sides), tenant accepts -> status Accepted + "Prepare rental agreement" bar
- note: sender's own message appears only after the server round trip (no optimistic add) - polish idea
- note: machine slept ~8 h in the middle of the run (timestamps 04:08 -> 12:06 are real elapsed time, not a bug)
## Agreement
- PASS agreement: tenant saves details (bad CNIC "123" -> "CNIC must be 13 digits..."), owner saves details + property/terms (period 100 -> "between 1 and 60 months"); checklist 3/3, Download button, PDF 58 KB application/pdf
- PASS PDF content verified visually: both parties + CNICs, property, 11 months 20 Dec 2026 -> 19 Nov 2027, Rs 92,000 rent / Rs 184,000 advance (the NEGOTIATED values), 10% increase, 30 days, Islamabad law; tenant can download, stranger gets "Offer not found"
## Notifications / Urdu
- PASS owner inbox: 5 events in order (accepted, new terms, message, verified, not approved w/ exact reason); Mark all as read clears bell + highlights; email switch persists server-side across reload
- PASS Urdu/RTL on chat, owner feed, agreement: layout mirrors, translations read correctly
- BUG FIXED (Urdu bidi): English chat message showed "?" at the start; "Rs 184000" read "184000 Rs"; time read "PM 12:06". Fixed with dir=auto on messages, dir=ltr on time line, and keeping "Rs amount" as one LTR unit in i18n.
## Mobile (375x812)
- PASS no horizontal overflow on /, /owner, /notifications, /owner/verify, chat, agreement, /my-request, /post
- BUG FIXED: chat header lost the person's NAME on phones (status badge + buttons squeezed it to zero). Badge now sits in the deal strip on phones; duplicate property title hidden there.
- PASS admin at 375px: stat cards stack, section nav scrolls. BUG FIXED: no way to sign out / leave admin on phones (sidebar hidden) -> "Site" + "Sign out" added to mobile nav. BUG FIXED: admin header row (title + filter tabs) made the whole page scroll sideways on phones -> wraps now (all 5 admin pages verified, no overflow)
## Role switch / session
- PASS menu "Switch to owner" -> new token, lands /owner, role Owner; "Switch to tenant" -> /post
- PASS corrupted token: first API call 401 -> auto sign-out, storage cleared, redirect to / with Sign in button
## Closing flows
- PASS tenant "I found a place": request closes, "no open request" + CTA; owner feed empties; accepted offer remains
- PASS tenant Decline (UI): status Declined, system line, composer replaced by "This offer is closed."
- PASS owner Withdraw (UI): status Withdrawn, composer gone; owner offers list shows Withdrawn/Rejected/Accepted
- PASS admin Requests: shows type, Close -> Expired; admin Users: Revoke -> "Not verified", owner status Rejected w/ "revoked" reason; re-verify works
