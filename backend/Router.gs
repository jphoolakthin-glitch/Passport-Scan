/**
 * Router.gs — the API entry point. Receives {action, token, payload, requestId},
 * runs the identity + permission check, calls the matching Service, returns JSON.
 *
 * Response (always HTTP 200, since Apps Script can't set status codes):
 *   { ok: true,  data: ...,                         requestId }
 *   { ok: false, error: { code, message, details }, requestId }
 *
 * Discarded on migration: only this file knows about doPost/ContentService.
 */
function routes_() {
  return {
    // perm: null = any signed-in, registered user. Otherwise the action name is the permission.
    'auth.me':              { perm: null, fn: function (p, ctx) { return ctx; } },
    'dashboard.summary':    { fn: dashboardSummary_ },
    'hotels.search':        { fn: hotelsSearch_ },
    'hotels.get':           { fn: hotelsGet_ },
    'hotels.save':          { fn: hotelsSave_ },
    'assets.list':          { fn: assetsList_ },
    'assets.get':           { fn: assetsGet_ },
    'assets.save':          { fn: assetsSave_ },
    'alerts.list':          { fn: alertsList_ },
    'alerts.update':        { fn: alertsUpdate_ },
    'users.list':           { fn: usersList_ },
    'users.save':           { fn: usersSave_ },
    'audit.list':           { fn: auditList_ },
    'admin.clearCache':     { fn: function () { bumpCacheVersion_(); return { cleared: true }; } },
    'admin.runLicenseCheck': { fn: function () { return runLicenseCheck(); } },
  };
}

function handleRequest_(body) {
  let requestId = '';
  try {
    let req;
    try {
      req = JSON.parse(body || '{}');
    } catch (e) {
      throw new AppError('BAD_REQUEST', 'Request body must be JSON');
    }
    requestId = str_(req.requestId) || uuid_();
    const route = routes_()[req.action];
    if (!route) throw new AppError('NOT_FOUND', 'Unknown action: ' + req.action);
    const payload = req.payload && typeof req.payload === 'object' ? req.payload : {};

    const ctx = authenticate_(req.token);
    if (route.perm !== null) requirePermission_(ctx, req.action);

    const data = route.fn(payload, ctx, { requestId: requestId });
    return { ok: true, data: data === undefined ? null : data, requestId: requestId };
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, error: { code: err.code, message: err.message, details: err.details }, requestId: requestId };
    }
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: { code: 'INTERNAL', message: 'Unexpected error', details: null }, requestId: requestId };
  }
}

function doPost(e) {
  const out = handleRequest_(e && e.postData ? e.postData.contents : '');
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** GET = health check only, so the deployment URL can be tested in a browser. */
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: { app: CONFIG.APP_NAME, time: nowIso_() } }))
    .setMimeType(ContentService.MimeType.JSON);
}
