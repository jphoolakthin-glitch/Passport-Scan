/**
 * Auth.gs — identity check and Role/Permission check (flowchart steps 2–3).
 *
 * The front end sends the Google ID token from "Sign in with Google" with every
 * request. We verify it with Google's tokeninfo endpoint, check the audience is
 * our Client ID, then cache the result until the token expires.
 */
function verifyIdToken_(token) {
  if (!token || typeof token !== 'string') throw new AppError('UNAUTHENTICATED', 'Please sign in');
  const tokenKey = 'tok:' + sha256Hex_(token);
  const cached = cacheGet_(tokenKey);
  if (cached) return cached;

  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) throw new AppError('UNAUTHENTICATED', 'Sign-in expired, please sign in again');
  const claims = JSON.parse(res.getContentText());

  const nowSec = Math.floor(Date.now() / 1000);
  if (claims.aud !== requireProp_('GOOGLE_CLIENT_ID')) throw new AppError('UNAUTHENTICATED', 'Token was issued for another app');
  if (CONFIG.TOKEN_ISSUERS.indexOf(claims.iss) === -1) throw new AppError('UNAUTHENTICATED', 'Invalid token issuer');
  if (String(claims.email_verified) !== 'true') throw new AppError('UNAUTHENTICATED', 'Email is not verified');
  const exp = parseInt(claims.exp, 10);
  if (!exp || exp <= nowSec) throw new AppError('UNAUTHENTICATED', 'Sign-in expired, please sign in again');

  const identity = { email: String(claims.email).toLowerCase(), name: claims.name || '', exp: exp };
  cachePut_(tokenKey, identity, Math.min(exp - nowSec, CONFIG.AUTH_CACHE_MAX_SECONDS));
  return identity;
}

/** Loads role, permissions and hotel scope for an email (cached). Returns null if not registered. */
function loadUserContext_(email) {
  const key = 'uc:' + email;
  const cached = cacheGet_(key);
  if (cached) return cached;

  const user = repo_('users').get(email);
  if (!user) return null;
  const permissions = repo_('role_permissions').findBy('role', user.role).map(function (r) { return r.action; });
  const isAll = permissions.indexOf('*') !== -1;
  const hotelIds = repo_('user_hotels').findBy('user_email', email).map(function (r) { return r.hotel_id; });

  const ctx = {
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    permissions: permissions,
    hotels: isAll || hotelIds.indexOf('*') !== -1 ? '*' : hotelIds,
  };
  cachePut_(key, ctx, CONFIG.USER_CACHE_SECONDS);
  return ctx;
}

function clearUserContext_(email) {
  cacheRemove_('uc:' + email);
}

/** Identity check + registry check. Throws UNAUTHENTICATED / FORBIDDEN ("access denied" in the flowchart). */
function authenticate_(token) {
  const identity = verifyIdToken_(token);
  const ctx = loadUserContext_(identity.email);
  if (!ctx || !ctx.active) {
    throw new AppError('FORBIDDEN', 'Account ' + identity.email + ' does not have access. Ask an admin to add you.');
  }
  return ctx;
}

function can_(ctx, action) {
  return ctx.permissions.indexOf('*') !== -1 || ctx.permissions.indexOf(action) !== -1;
}

function requirePermission_(ctx, action) {
  if (!can_(ctx, action)) throw new AppError('FORBIDDEN', 'You do not have permission for ' + action);
}

function canAccessHotel_(ctx, hotelId) {
  return ctx.hotels === '*' || ctx.hotels.indexOf(hotelId) !== -1;
}

function requireHotelAccess_(ctx, hotelId) {
  if (!canAccessHotel_(ctx, hotelId)) throw new AppError('FORBIDDEN', 'You do not have access to this hotel');
}
