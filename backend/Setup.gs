/**
 * Setup.gs — run once from the Apps Script editor (select a function, press Run).
 *
 *   setup()            creates the Data and Audit spreadsheets (or repairs missing sheets),
 *                      writes headers, seeds default roles and makes you the first admin.
 *   installTriggers()  schedules runLicenseCheck() daily at LICENSE_JOB_HOUR (Asia/Bangkok).
 *   seedDemoData()     optional: 3 demo hotels with a few records, for trying the app.
 */
function setup() {
  const dataSs = ensureSpreadsheet_('DATA_SPREADSHEET_ID', 'PSMS Data');
  const auditSs = ensureSpreadsheet_('AUDIT_SPREADSHEET_ID', 'PSMS Audit Log');

  Object.keys(SCHEMA).forEach(function (table) {
    ensureSheet_(SCHEMA[table].file === 'audit' ? auditSs : dataSs, table);
  });
  [dataSs, auditSs].forEach(function (ss) {
    const stray = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
    if (stray && ss.getSheets().length > 1) ss.deleteSheet(stray);
  });
  __spreadsheets = {};
  __repos = {};

  const rp = repo_('role_permissions');
  if (!rp.all().length) {
    const rows = [];
    Object.keys(DEFAULT_ROLE_PERMISSIONS).forEach(function (role) {
      DEFAULT_ROLE_PERMISSIONS[role].forEach(function (action) { rows.push({ id: uuid_(), role: role, action: action }); });
    });
    rp.insertMany(rows);
  }

  const owner = Session.getEffectiveUser().getEmail().toLowerCase();
  if (owner && !repo_('users').get(owner)) {
    const now = nowIso_();
    repo_('users').insert({ email: owner, name: 'Owner', role: 'admin', active: true, created_at: now, updated_at: now });
    repo_('user_hotels').insert({ id: uuid_(), user_email: owner, hotel_id: '*' });
  }
  bumpCacheVersion_();

  const msg = [
    'Setup complete.',
    'Data spreadsheet:  ' + dataSs.getUrl(),
    'Audit spreadsheet: ' + auditSs.getUrl(),
    'First admin:       ' + owner,
    getProp_('GOOGLE_CLIENT_ID') ? 'GOOGLE_CLIENT_ID is set.' : 'NEXT: set Script Property GOOGLE_CLIENT_ID (see README step 3).',
  ].join('\n');
  console.log(msg);
  return msg;
}

function ensureSpreadsheet_(propKey, name) {
  const id = getProp_(propKey);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* deleted: create a new one */ }
  }
  const ss = SpreadsheetApp.create(name);
  setProp_(propKey, ss.getId());
  return ss;
}

function ensureSheet_(ss, table) {
  const names = columnNames_(table);
  let sh = ss.getSheetByName(table);
  if (!sh) sh = ss.insertSheet(table);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, names.length).setValues([names]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  // Plain text everywhere: Sheets must not turn "2026-11-04" into a Date or "0012" into 12.
  sh.getRange(1, 1, sh.getMaxRows(), names.length).setNumberFormat('@');
  return sh;
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runLicenseCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runLicenseCheck').timeBased().everyDays(1)
    .atHour(CONFIG.LICENSE_JOB_HOUR).inTimezone(CONFIG.TIMEZONE).create();
  const msg = 'runLicenseCheck scheduled daily around ' + CONFIG.LICENSE_JOB_HOUR + ':00 ' + CONFIG.TIMEZONE;
  console.log(msg);
  return msg;
}

function seedDemoData() {
  const now = nowIso_();
  const today = todayDate_();
  const addDays = function (n) {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const hotels = [
    { code: 'BKK01', name: 'Demo Hotel Sukhumvit', province: 'Bangkok' },
    { code: 'CNX01', name: 'Demo Hotel Nimman', province: 'Chiang Mai' },
    { code: 'HKT01', name: 'Demo Hotel Patong', province: 'Phuket' },
  ].map(function (h) {
    return Object.assign({ hotel_id: uuid_(), address: '', contact_name: '', contact_phone: '', active: true, created_at: now, updated_at: now }, h);
  });
  repo_('hotels').insertMany(hotels);

  const assets = [];
  hotels.forEach(function (h, i) {
    [
      ['PC', 'Front desk PC 1', 'Windows 11 Pro', 200 + i * 30],
      ['PC', 'Front desk PC 2', 'Windows 11 Pro', 10 + i * 5],
      ['SCANNER', 'Passport scanner 1', 'Scanner SDK', -3 + i * 20],
      ['SERVER', 'Back office server', 'Antivirus', 25 - i * 10],
    ].forEach(function (r, j) {
      assets.push({
        asset_id: uuid_(), hotel_id: h.hotel_id, type: r[0], name: r[1], brand: '', model: '',
        serial_number: h.code + '-' + (j + 1), ip_address: '192.168.1.' + (10 + j), location: r[0] === 'SERVER' ? 'Server room' : 'Front desk',
        status: 'ACTIVE', license_name: r[2], license_expiry: addDays(r[3]), notes: '',
        created_at: now, created_by: 'seed', updated_at: now, updated_by: 'seed',
      });
    });
  });
  repo_('assets').insertMany(assets);
  bumpCacheVersion_();
  return 'Seeded ' + hotels.length + ' hotels and ' + assets.length + ' records';
}
