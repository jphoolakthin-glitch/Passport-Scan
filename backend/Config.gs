/**
 * Config.gs — app constants and Script Properties access.
 *
 * Values that differ per installation live in Script Properties
 * (Project Settings > Script Properties), not in this file:
 *   GOOGLE_CLIENT_ID      OAuth Client ID used by "Sign in with Google" (required)
 *   DATA_SPREADSHEET_ID   set automatically by setup()
 *   AUDIT_SPREADSHEET_ID  set automatically by setup()
 *   ALERT_DAYS_BEFORE     days before license expiry to alert (default 30)  [Open in brief]
 *   ALERT_EMAILS          comma-separated emails for the daily license summary (optional) [Open]
 */
const CONFIG = {
  APP_NAME: 'Passport Scanner Management System',
  TIMEZONE: 'Asia/Bangkok',
  PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,
  /** Token verification cache; capped by the token's own expiry (Google ID tokens last ~1 h). */
  AUTH_CACHE_MAX_SECONDS: 21600,
  /** User context (role, permissions, hotels) cache. */
  USER_CACHE_SECONDS: 600,
  /** Per-hotel asset list cache. */
  DATA_CACHE_SECONDS: 600,
  LOCK_WAIT_MS: 15000,
  DEFAULT_ALERT_DAYS_BEFORE: 30,
  LICENSE_JOB_HOUR: 7,
  TOKEN_ISSUERS: ['accounts.google.com', 'https://accounts.google.com'],
};

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

function requireProp_(key) {
  const v = getProp_(key);
  if (!v) throw new AppError('CONFIG', 'Script Property ' + key + ' is not set. Run setup() and see README.');
  return v;
}

function alertDaysBefore_() {
  const n = parseInt(getProp_('ALERT_DAYS_BEFORE'), 10);
  return isNaN(n) || n < 0 ? CONFIG.DEFAULT_ALERT_DAYS_BEFORE : n;
}
