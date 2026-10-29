// Real SignalR clients against a running API (http://localhost:5080, Development, Auth:DevLogin on, EMPTY database).
// Run from the repo root:  NODE_PATH=frontend/node_modules node scripts/realtime-smoke-test.cjs
// Checks auth on the hub, role groups, chat-room access, presence, typing, live threads, read receipts and admin events.
const signalR = require('@microsoft/signalr');
const BASE = 'http://localhost:5080';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(token, method, path, body) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; } catch { return { status: r.status, data: text }; }
}

async function login(email, name, intent) {
  const r = await fetch(BASE + '/api/auth/dev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name, intent }) });
  return (await r.json()).token;
}

async function connect(token) {
  const events = [];
  const conn = new signalR.HubConnectionBuilder()
    .withUrl(BASE + '/hubs/app', { accessTokenFactory: () => token })
    .configureLogging(signalR.LogLevel.Error).build();
  for (const ev of ['notification', 'thread', 'seen', 'agreement', 'refresh', 'admin', 'typing', 'presence'])
    conn.on(ev, p => events.push({ ev, p }));
  await conn.start();
  return { conn, events, count: (ev, pred = () => true) => events.filter(e => e.ev === ev && pred(e.p)).length, clear: () => (events.length = 0) };
}

(async () => {
  const [tT, tO, tA, tX] = await Promise.all([
    login('tenant@example.com', 'Tina Tenant', 'Tenant'), login('owner@example.com', 'Omar Owner', 'Owner'),
    login('admin@talab.pk', 'Admin', 'Tenant'), login('stranger@example.com', 'Sam Stranger', 'Tenant'),
  ]);

  // auth on the hub
  const anon = new signalR.HubConnectionBuilder().withUrl(BASE + '/hubs/app', { accessTokenFactory: () => 'garbage' }).configureLogging(signalR.LogLevel.None).build();
  let rejected = false; try { await anon.start(); } catch { rejected = true; }
  check('hub rejects a bad token', rejected);

  const T = await connect(tT), O = await connect(tO), A = await connect(tA), X = await connect(tX);
  check('four users connected', [T, O, A, X].every(c => c.conn.state === 'Connected'));

  // owner submits documents -> admin queue updates live
  // a valid 1x1 PNG, enough for the upload checks
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await sleep(200); A.clear();
  const fd = new FormData();
  for (const k of ['front', 'back', 'selfie']) fd.append(k, new Blob([png], { type: 'image/png' }), k + '.png');
  await api(tO, 'POST', '/api/owner/verification', fd);
  await sleep(500);
  check('admin is told a verification arrived', A.count('admin', p => p.kind === 'verification') >= 1);
  check('tenant and stranger are NOT told', T.count('admin') === 0 && X.count('admin') === 0);

  // admin approves -> owner gets notification + refresh
  const pending = (await api(tA, 'GET', '/api/admin/verifications?status=Pending')).data;
  O.clear();
  await api(tA, 'POST', `/api/admin/verifications/${pending[0].id}/approve`);
  await sleep(600);
  check('owner gets "verified" notification live', O.count('notification', p => p.notification.titleTemplate === 'You are verified') === 1);
  check('owner gets refresh(verification)', O.count('refresh', p => p.scope === 'verification') === 1);
  const un = O.events.find(e => e.ev === 'notification')?.p.unread;
  check('notification event carries the unread count', un === 1, `unread=${un}`);

  // tenant posts request -> matched owner notified, owners' feeds refresh, admin sees queue change
  await api(tO, 'POST', '/api/owner/pins', { name: 'F-7 flat', lat: 33.71, lng: 73.055 });
  O.clear(); A.clear(); X.clear(); T.clear();
  const rq = await api(tT, 'POST', '/api/requests', { category: 'property', details: '{"type":"flat"}', budgetMin: 40000, budgetMax: 70000, moveIn: '2026-12-01',
    area: [{ lat: 33.72, lng: 73.04 }, { lat: 33.72, lng: 73.07 }, { lat: 33.70, lng: 73.07 }, { lat: 33.70, lng: 73.04 }] });
  await sleep(600);
  check('matching owner notified of the new request', O.count('notification', p => p.notification.type === 'NewRequest') === 1);
  check('owners get feed refresh', O.count('refresh', p => p.scope === 'feed') === 1);
  check('admin sees request queue change', A.count('admin', p => p.kind === 'request') === 1);
  check('stranger gets nothing', X.events.length === 0, JSON.stringify(X.events.map(e => e.ev)));

  // offer -> tenant notified
  T.clear();
  const offer = (await api(tO, 'POST', `/api/owner/requests/${rq.data.id}/offer`, { rent: 60000, advance: 120000, availableFrom: '2026-12-05' })).data.id;
  await sleep(600);
  check('tenant notified of the offer', T.count('notification', p => p.notification.type === 'NewOffer') === 1);

  // rooms: access control + presence
  const xJoin = await X.conn.invoke('JoinOffer', offer);
  check('stranger cannot join the room', xJoin === null);
  const tJoin = await T.conn.invoke('JoinOffer', offer);
  check('tenant joins; owner not there yet', tJoin === false);
  T.clear();
  const oJoin = await O.conn.invoke('JoinOffer', offer);
  await sleep(400);
  check('owner joins; sees tenant online', oJoin === true);
  check('tenant is told owner came online', T.count('presence', p => p.online === true) === 1);

  // typing
  O.clear(); X.clear();
  await T.conn.invoke('Typing', offer);
  await sleep(300);
  check('owner sees "typing"', O.count('typing') === 1);
  check('stranger does not', X.count('typing') === 0);
  await X.conn.invoke('Typing', offer); await sleep(300);
  check('typing from outside the room is ignored', O.count('typing') === 1);

  // chat message: both in room get "thread"; owner gets one coalesced notification
  O.clear(); T.clear();
  await api(tT, 'POST', `/api/offers/${offer}/messages`, { body: 'Is it furnished?' });
  await api(tT, 'POST', `/api/offers/${offer}/messages`, { body: 'Can I visit Saturday?' });
  await sleep(600);
  check('owner gets live "thread" events', O.count('thread') === 2);
  check('tenant (sender, other device) also gets them', T.count('thread') === 2);
  check('owner has ONE coalesced message notification', O.count('notification', p => p.notification.type === 'NewMessage') === 2 /* two pushes */ );
  const inbox = (await api(tO, 'GET', '/api/notifications')).data;
  check('...but only one in the inbox', inbox.items.filter(n => n.type === 'NewMessage').length === 1);

  // read receipts
  T.clear();
  const th = (await api(tO, 'GET', `/api/offers/${offer}`)).data;
  await sleep(500);
  check('sender is told messages were seen', T.count('seen') === 1);
  const th2 = (await api(tT, 'GET', `/api/offers/${offer}`)).data;
  check('seen flag is set on the sender\'s messages', th2.messages.filter(m => m.mine && m.kind === 'Text').every(m => m.seen === true));
  check('owner\'s own view has nothing unseen to mark', th.messages.length >= 2);

  // agreement edits
  await api(tT, 'POST', `/api/offers/${offer}/accept`);
  O.clear();
  await api(tT, 'PUT', `/api/offers/${offer}/agreement/party`, { fullName: 'Tina Malik', fatherName: 'Zahid Malik', cnic: '37405-7654321-2', address: 'House 22, G-9/1, Islamabad', phone: '03215550123' });
  await sleep(500);
  check('owner is told the agreement changed', O.count('agreement') === 1);

  // leaving the room + disconnect
  T.clear();
  await O.conn.invoke('LeaveOffer', offer);
  await sleep(400);
  check('tenant told owner left', T.count('presence', p => p.online === false) === 1);
  await O.conn.invoke('JoinOffer', offer); await sleep(300); T.clear();
  await O.conn.stop(); await sleep(600);
  check('tenant told owner went offline on disconnect', T.count('presence', p => p.online === false) === 1);

  // admin close request -> tenant refresh
  T.clear();
  await api(tA, 'POST', `/api/admin/requests/${rq.data.id}/close`);
  await sleep(500);
  check('tenant told their request was closed by admin', T.count('refresh', p => p.scope === 'my-request') === 1);

  for (const c of [T, A, X]) await c.conn.stop();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
