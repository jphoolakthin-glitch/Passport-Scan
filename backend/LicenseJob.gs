/**
 * LicenseJob.gs — Flow 2: the scheduled license check.
 * Runs daily from a Time-driven Trigger (installTriggers() in Setup.gs).
 *
 *  - license expires within ALERT_DAYS_BEFORE days -> LICENSE_EXPIRING alert
 *  - license already expired                      -> LICENSE_EXPIRED alert
 *  - one unresolved alert per asset + expiry date + type (no duplicates day after day)
 *  - open alerts whose license was renewed (expiry changed / record retired) -> RESOLVED
 *  - optional email summary to ALERT_EMAILS
 */
function runLicenseCheck() {
  return withLock_(function () {
    const today = todayDate_();
    const windowDays = alertDaysBefore_();
    const now = nowIso_();
    const alertsRepo = repo_('alerts');
    const assets = repo_('assets').all();
    const alerts = alertsRepo.all();

    const assetById = {};
    assets.forEach(function (a) { assetById[a.asset_id] = a; });

    // 1. Auto-resolve alerts that no longer apply.
    let resolved = 0;
    alerts.forEach(function (al) {
      if (al.status === 'RESOLVED') return;
      const a = assetById[al.asset_id];
      const stillValid = a && a.status !== 'RETIRED' && a.license_expiry === al.license_expiry &&
        daysBetween_(today, a.license_expiry) <= windowDays;
      if (!stillValid) {
        al.status = 'RESOLVED';
        al.updated_at = now;
        al.updated_by = 'system';
        alertsRepo.update(al);
        resolved++;
      }
    });

    // 2. Create new alerts.
    const existing = {};
    alerts.forEach(function (al) {
      if (al.status !== 'RESOLVED') existing[al.asset_id + '|' + al.license_expiry + '|' + al.alert_type] = al;
    });

    const created = [];
    assets.forEach(function (a) {
      if (!a.license_expiry || a.status === 'RETIRED' || !isValidDate_(a.license_expiry)) return;
      const days = daysBetween_(today, a.license_expiry);
      if (days > windowDays) return;
      const type = days < 0 ? 'LICENSE_EXPIRED' : 'LICENSE_EXPIRING';
      const key = a.asset_id + '|' + a.license_expiry + '|' + type;
      if (existing[key]) {
        if (existing[key].days_left !== days) {
          existing[key].days_left = days;
          alertsRepo.update(existing[key]);
        }
        return;
      }
      // An expired alert replaces the earlier "expiring" one.
      const earlier = existing[a.asset_id + '|' + a.license_expiry + '|LICENSE_EXPIRING'];
      if (type === 'LICENSE_EXPIRED' && earlier) {
        earlier.status = 'RESOLVED';
        earlier.updated_at = now;
        earlier.updated_by = 'system';
        alertsRepo.update(earlier);
      }
      created.push({
        alert_id: uuid_(),
        created_at: now,
        asset_id: a.asset_id,
        hotel_id: a.hotel_id,
        alert_type: type,
        license_expiry: a.license_expiry,
        days_left: days,
        message: (a.license_name || 'License') + ' on ' + a.type + ' "' + a.name + '" ' +
          (days < 0 ? 'expired ' + (-days) + ' day(s) ago' : days === 0 ? 'expires today' : 'expires in ' + days + ' day(s)'),
        status: 'OPEN',
        updated_at: now,
        updated_by: 'system',
      });
    });
    alertsRepo.insertMany(created);

    const result = { date: today, windowDays: windowDays, checked: assets.length, created: created.length, resolved: resolved };
    writeAudit_(null, 'job.licenseCheck', 'job', 'license_check', null, result, '');
    sendLicenseEmail_(created);
    console.log(JSON.stringify(result));
    return result;
  });
}

function sendLicenseEmail_(created) {
  const to = str_(getProp_('ALERT_EMAILS'));
  if (!to || !created.length) return;
  const names = {};
  allHotels_().forEach(function (h) { names[h.hotel_id] = h.name; });
  const lines = created.map(function (a) { return '- [' + (names[a.hotel_id] || a.hotel_id) + '] ' + a.message; });
  MailApp.sendEmail(to, CONFIG.APP_NAME + ': ' + created.length + ' new license alert(s)', lines.join('\n'));
}
