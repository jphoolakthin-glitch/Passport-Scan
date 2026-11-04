/**
 * AlertService.gs — alert items produced by the scheduled license check.
 */
function alertsList_(payload, ctx) {
  let rows = payload.hotel_id
    ? (requireHotelAccess_(ctx, str_(payload.hotel_id)), repo_('alerts').findBy('hotel_id', str_(payload.hotel_id)))
    : repo_('alerts').all();
  rows = rows.map(stripRow_).filter(function (a) { return canAccessHotel_(ctx, a.hotel_id); });
  const status = payload.status === undefined ? 'OPEN' : payload.status; // '' = every status
  if (status) rows = rows.filter(function (a) { return a.status === status; });
  rows.sort(function (a, b) { return (a.days_left || 0) - (b.days_left || 0); });

  const hotelNames = {};
  allHotels_().forEach(function (h) { hotelNames[h.hotel_id] = h.name; });
  rows.forEach(function (a) { a.hotel_name = hotelNames[a.hotel_id] || ''; });
  return paginate_(rows, payload);
}

function alertsUpdate_(payload, ctx, meta) {
  const v = Validator_();
  v.required('alert_id', payload.alert_id);
  v.required('status', payload.status);
  v.oneOf('status', payload.status, ENUMS.alert_status);
  v.check();

  return withLock_(function () {
    const repo = repo_('alerts');
    const before = repo.get(str_(payload.alert_id));
    if (!before) throw new AppError('NOT_FOUND', 'Alert not found');
    requireHotelAccess_(ctx, before.hotel_id);
    const after = Object.assign({}, stripRow_(before), { status: payload.status, updated_at: nowIso_(), updated_by: ctx.email });
    repo.update(after);
    writeAudit_(ctx, 'alerts.update', 'alert', after.alert_id, before, after, meta.requestId);
    return after;
  });
}
