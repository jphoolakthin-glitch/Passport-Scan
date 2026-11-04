/**
 * Backend tests: runs the real backend/*.gs code against the in-memory mocks.
 *   node --test dev/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./gas-mock');

const ADMIN = 'owner@example.com';
const EDITOR = 'editor@example.com';
const VIEWER = 'viewer@example.com';

function boot() {
  const gas = createGas();
  gas.setup();
  gas.setProp_('GOOGLE_CLIENT_ID', 'dev-client-id');
  gas.seedDemoData();
  return gas;
}

function ok(res) {
  assert.equal(res.ok, true, JSON.stringify(res.error));
  return JSON.parse(JSON.stringify(res.data)); // as it would arrive over HTTP
}

function err(res, code) {
  assert.equal(res.ok, false, 'expected error ' + code);
  assert.equal(res.error.code, code, res.error.message);
  return res.error;
}

test('setup creates every sheet with schema headers and makes the owner admin', () => {
  const gas = boot();
  const data = Object.values(gas.state.spreadsheets).find((s) => s.name === 'PSMS Data');
  const audit = Object.values(gas.state.spreadsheets).find((s) => s.name === 'PSMS Audit Log');
  assert.deepEqual(data.sheets.map((s) => s.name).sort(), ['alerts', 'assets', 'hotels', 'role_permissions', 'user_hotels', 'users']);
  assert.deepEqual(audit.sheets.map((s) => s.name), ['audit_log']);
  const me = ok(gas.call('auth.me', {}, ADMIN));
  assert.equal(me.role, 'admin');
  assert.equal(me.hotels, '*');
  gas.setup(); // idempotent
  assert.equal(ok(gas.call('users.list', {}, ADMIN)).total, 1);
});

test('identity check: missing / invalid token / unregistered / inactive', () => {
  const gas = boot();
  err(gas.call('auth.me', {}), 'UNAUTHENTICATED');
  gas.resetExecution();
  err(gas.handleRequest_(JSON.stringify({ action: 'auth.me', token: 'garbage' })), 'UNAUTHENTICATED');
  err(gas.call('auth.me', {}, 'stranger@gmail.com'), 'FORBIDDEN');
  ok(gas.call('users.save', { email: VIEWER, name: 'V', role: 'viewer', active: false, hotels: ['*'] }, ADMIN));
  err(gas.call('auth.me', {}, VIEWER), 'FORBIDDEN');
  err(gas.handleRequest_('not json'), 'BAD_REQUEST');
  err(gas.call('nope.nothing', {}, ADMIN), 'NOT_FOUND');
});

test('role and hotel scope are enforced on the server', () => {
  const gas = boot();
  const hotels = ok(gas.call('hotels.search', {}, ADMIN)).items;
  assert.equal(hotels.length, 3);
  const [h1, h2] = hotels;

  ok(gas.call('users.save', { email: EDITOR, name: 'E', role: 'editor', hotels: [h1.hotel_id] }, ADMIN));
  ok(gas.call('users.save', { email: VIEWER, name: 'V', role: 'viewer', hotels: ['*'] }, ADMIN));

  // editor sees only the assigned hotel
  const eh = ok(gas.call('hotels.search', {}, EDITOR));
  assert.deepEqual(eh.items.map((h) => h.hotel_id), [h1.hotel_id]);
  err(gas.call('assets.list', { hotel_id: h2.hotel_id }, EDITOR), 'FORBIDDEN');
  err(gas.call('assets.save', { hotel_id: h2.hotel_id, type: 'PC', name: 'x' }, EDITOR), 'FORBIDDEN');
  err(gas.call('users.list', {}, EDITOR), 'FORBIDDEN');
  err(gas.call('hotels.save', { code: 'X', name: 'X' }, EDITOR), 'FORBIDDEN');

  // viewer can read every hotel but can't write
  assert.equal(ok(gas.call('assets.list', { hotel_id: h2.hotel_id }, VIEWER)).total, 4);
  err(gas.call('assets.save', { hotel_id: h2.hotel_id, type: 'PC', name: 'x' }, VIEWER), 'FORBIDDEN');

  // editor can't move one of their records into a hotel they don't manage
  const a = ok(gas.call('assets.list', { hotel_id: h1.hotel_id }, EDITOR)).items[0];
  err(gas.call('assets.save', { ...a, hotel_id: h2.hotel_id }, EDITOR), 'FORBIDDEN');
});

test('create and edit a record: validation, audit log, conflict detection, cache refresh', () => {
  const gas = boot();
  const h = ok(gas.call('hotels.search', {}, ADMIN)).items[0];

  const v = err(gas.call('assets.save', { hotel_id: h.hotel_id, type: 'PRINTER', name: '', license_expiry: '2026-02-30', ip_address: 'abc' }, ADMIN), 'VALIDATION');
  assert.deepEqual(Object.keys(v.details).sort(), ['ip_address', 'license_expiry', 'license_name', 'name', 'type']);

  const created = ok(gas.call('assets.save', { hotel_id: h.hotel_id, type: 'scanner', name: 'Scanner 2', serial_number: '0012', license_name: 'SDK', license_expiry: '2027-01-31' }, ADMIN));
  assert.equal(created.type, 'SCANNER');
  assert.equal(created.status, 'ACTIVE');
  assert.equal(created.created_by, ADMIN);

  // list shows it (per-hotel cache invalidated) and leading zeros / dates are preserved as text
  const listed = ok(gas.call('assets.list', { hotel_id: h.hotel_id, type: 'SCANNER' }, ADMIN)).items;
  const got = listed.find((x) => x.asset_id === created.asset_id);
  assert.equal(got.serial_number, '0012');
  assert.equal(got.license_expiry, '2027-01-31');

  const edited = ok(gas.call('assets.save', { ...got, name: 'Scanner 2 (lobby)' }, ADMIN));
  assert.equal(edited.name, 'Scanner 2 (lobby)');
  assert.equal(edited.created_by, ADMIN);
  // the copy loaded before the edit is now stale
  const c = err(gas.call('assets.save', { ...got, name: 'stale' }, ADMIN), 'CONFLICT');
  assert.equal(c.details.current.name, 'Scanner 2 (lobby)');

  const audit = ok(gas.call('audit.list', { entity_id: created.asset_id }, ADMIN)).items;
  assert.deepEqual(audit.map((r) => r.action).sort(), ['assets.create', 'assets.update']);
  const upd = audit.find((r) => r.action === 'assets.update');
  assert.equal(upd.before.name, 'Scanner 2');
  assert.equal(upd.after.name, 'Scanner 2 (lobby)');
  assert.equal(upd.user_email, ADMIN);
});

test('scheduled license check: creates, de-duplicates, escalates and resolves alerts', () => {
  const gas = boot();
  // seed: per hotel, licenses at +200/+10/-3/+25 (hotel 1), +230/+15/+17/+15 (hotel 2), +260/+20/+37/+5 (hotel 3)
  const r1 = gas.runLicenseCheck();
  assert.equal(r1.checked, 12);
  const alerts = ok(gas.call('alerts.list', {}, ADMIN));
  assert.equal(alerts.total, r1.created);
  assert.equal(r1.created, 8); // every license with <= 30 days left, incl. one already expired
  assert.equal(alerts.items[0].alert_type, 'LICENSE_EXPIRED');
  assert.ok(alerts.items[0].hotel_name);

  // running again creates nothing new
  gas.resetExecution();
  assert.equal(gas.runLicenseCheck().created, 0);

  // renewing a license resolves its alert on the next run
  const al = alerts.items.find((a) => a.alert_type === 'LICENSE_EXPIRING');
  const asset = ok(gas.call('assets.get', { asset_id: al.asset_id }, ADMIN));
  ok(gas.call('assets.save', { ...asset, license_expiry: '2030-01-01' }, ADMIN));
  gas.resetExecution();
  const r3 = gas.runLicenseCheck();
  assert.equal(r3.resolved, 1);
  assert.equal(ok(gas.call('alerts.list', {}, ADMIN)).total, 7);

  // acknowledging is an audited change
  const ack = ok(gas.call('alerts.update', { alert_id: alerts.items[0].alert_id, status: 'ACKNOWLEDGED' }, ADMIN));
  assert.equal(ack.status, 'ACKNOWLEDGED');
  assert.equal(ok(gas.call('alerts.list', {}, ADMIN)).total, 6);
});

test('license email goes to ALERT_EMAILS when new alerts appear', () => {
  const gas = boot();
  gas.setProp_('ALERT_EMAILS', 'it@example.com');
  gas.runLicenseCheck();
  assert.equal(gas.mail.length, 1);
  assert.match(gas.mail[0].subject, /8 new license alert/);
});

test('dashboard summary respects hotel scope', () => {
  const gas = boot();
  const all = ok(gas.call('dashboard.summary', {}, ADMIN));
  assert.equal(all.hotels, 3);
  assert.equal(all.assets, 12);
  assert.equal(all.byType.PC, 6);
  assert.equal(all.expiringTotal, 8);

  const h = ok(gas.call('hotels.search', { q: 'phuket' }, ADMIN)).items;
  assert.equal(h.length, 1);
  ok(gas.call('users.save', { email: EDITOR, name: 'E', role: 'editor', hotels: [h[0].hotel_id] }, ADMIN));
  const mine = ok(gas.call('dashboard.summary', {}, EDITOR));
  assert.equal(mine.hotels, 1);
  assert.equal(mine.assets, 4);
});

test('admin guards: duplicate hotel code, unknown role, self-demotion', () => {
  const gas = boot();
  err(gas.call('hotels.save', { code: 'bkk01', name: 'Dup' }, ADMIN), 'VALIDATION');
  const nh = ok(gas.call('hotels.save', { code: 'krb01', name: 'Demo Krabi' }, ADMIN));
  assert.equal(nh.code, 'KRB01');
  err(gas.call('users.save', { email: EDITOR, role: 'superuser' }, ADMIN), 'VALIDATION');
  err(gas.call('users.save', { email: ADMIN, role: 'viewer' }, ADMIN), 'VALIDATION');
  err(gas.call('users.save', { email: EDITOR, role: 'editor', hotels: ['no-such-hotel'] }, ADMIN), 'VALIDATION');
});

test('role changes take effect immediately for that user', () => {
  const gas = boot();
  ok(gas.call('users.save', { email: EDITOR, name: 'E', role: 'viewer', hotels: ['*'] }, ADMIN));
  ok(gas.call('auth.me', {}, EDITOR)); // cached as viewer
  const h = ok(gas.call('hotels.search', {}, EDITOR)).items[0];
  err(gas.call('assets.save', { hotel_id: h.hotel_id, type: 'PC', name: 'n' }, EDITOR), 'FORBIDDEN');
  ok(gas.call('users.save', { email: EDITOR, name: 'E', role: 'editor', hotels: ['*'] }, ADMIN));
  ok(gas.call('assets.save', { hotel_id: h.hotel_id, type: 'PC', name: 'n' }, EDITOR));
});

test('doPost / doGet wrap JSON', () => {
  const gas = boot();
  const out = gas.doPost({ postData: { contents: JSON.stringify({ action: 'auth.me', token: 'dev:' + ADMIN, requestId: 'r1' }) } });
  const body = JSON.parse(out.getContent());
  assert.equal(body.ok, true);
  assert.equal(body.requestId, 'r1');
  assert.equal(JSON.parse(gas.doGet().getContent()).ok, true);
  assert.match(gas.installTriggers(), /daily/);
  assert.equal(gas.triggers.length, 1);
  gas.installTriggers();
  assert.equal(gas.triggers.length, 1);
});

test('tables grow past the 1,000 rows a new sheet starts with', () => {
  const gas = createGas({ maxRows: 30 });
  gas.setup();
  gas.setProp_('GOOGLE_CLIENT_ID', 'dev-client-id');
  gas.seedDemoData();
  const h = ok(gas.call('hotels.search', {}, ADMIN)).items[0];
  for (let i = 0; i < 40; i++) ok(gas.call('assets.save', { hotel_id: h.hotel_id, type: 'PC', name: 'PC ' + i }, ADMIN));
  assert.equal(ok(gas.call('assets.list', { hotel_id: h.hotel_id, pageSize: 200 }, ADMIN)).total, 44);
  assert.equal(ok(gas.call('audit.list', { entity: 'asset' }, ADMIN)).total, 40);
});
