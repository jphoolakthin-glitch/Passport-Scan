/**
 * Audit.gs — every save writes one row to audit_log in the separate audit spreadsheet.
 */
function writeAudit_(ctx, action, entity, entityId, before, after, requestId) {
  repo_('audit_log').insert({
    audit_id: uuid_(),
    timestamp: nowIso_(),
    user_email: ctx ? ctx.email : 'system',
    action: action,
    entity: entity,
    entity_id: entityId,
    before: before ? stripRow_(before) : null,
    after: after ? stripRow_(after) : null,
    request_id: requestId || '',
  });
}

function stripRow_(obj) {
  return JSON.parse(JSON.stringify(obj)); // drops the non-enumerable _row
}

/** audit.list — admin only. Newest first. */
function auditList_(payload) {
  let rows = payload.entity_id
    ? repo_('audit_log').findBy('entity_id', str_(payload.entity_id))
    : repo_('audit_log').all();
  if (payload.entity) rows = rows.filter(function (r) { return r.entity === payload.entity; });
  if (payload.user_email) rows = rows.filter(function (r) { return r.user_email === str_(payload.user_email).toLowerCase(); });
  rows.sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0; });
  return paginate_(rows.map(stripRow_), payload);
}

/** Runs fn while holding the script lock, so concurrent saves can't overwrite each other. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_WAIT_MS)) throw new AppError('BUSY', 'The system is busy, please try again');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
