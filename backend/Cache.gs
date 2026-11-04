/**
 * Cache.gs — CacheService wrapper with a global version number.
 * bumpCacheVersion_() invalidates every cached user context and list at once,
 * e.g. after an admin edits role_permissions directly in the sheet.
 */
function cacheVersion_() {
  return getProp_('CACHE_VERSION') || '1';
}

function bumpCacheVersion_() {
  setProp_('CACHE_VERSION', String(parseInt(cacheVersion_(), 10) + 1));
}

function cacheKey_(key) {
  return 'v' + cacheVersion_() + ':' + key;
}

function cacheGet_(key) {
  const raw = CacheService.getScriptCache().get(cacheKey_(key));
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function cachePut_(key, value, seconds) {
  const raw = JSON.stringify(value);
  if (raw.length > 95000) return; // CacheService value limit is 100 KB
  CacheService.getScriptCache().put(cacheKey_(key), raw, Math.max(1, Math.min(seconds, 21600)));
}

function cacheRemove_(key) {
  CacheService.getScriptCache().remove(cacheKey_(key));
}
