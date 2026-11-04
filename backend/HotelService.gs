/**
 * HotelService.gs — hotel search (flowchart step 5) and hotel admin.
 */
const HOTEL_FIELDS = ['code', 'name', 'province', 'address', 'contact_name', 'contact_phone', 'active'];

function allHotels_() {
  const cached = cacheGet_('hotels:all');
  if (cached) return cached;
  const rows = repo_('hotels').all().map(stripRow_);
  cachePut_('hotels:all', rows, CONFIG.DATA_CACHE_SECONDS);
  return rows;
}

function hotelsSearch_(payload, ctx) {
  const q = str_(payload.q);
  let rows = allHotels_().filter(function (h) { return canAccessHotel_(ctx, h.hotel_id); });
  if (!payload.includeInactive) rows = rows.filter(function (h) { return h.active; });
  if (q) rows = rows.filter(function (h) { return includesText_([h.code, h.name, h.province], q); });
  rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
  return paginate_(rows, payload);
}

function hotelsGet_(payload, ctx) {
  const id = str_(payload.hotel_id);
  requireHotelAccess_(ctx, id);
  const hotel = allHotels_().filter(function (h) { return h.hotel_id === id; })[0];
  if (!hotel) throw new AppError('NOT_FOUND', 'Hotel not found');
  return hotel;
}

function hotelsSave_(payload, ctx, meta) {
  const v = Validator_();
  v.required('code', payload.code);
  v.required('name', payload.name);
  v.maxLen('code', payload.code, 30);
  v.maxLen('name', payload.name, 200);
  v.maxLen('address', payload.address, 500);
  v.check();

  return withLock_(function () {
    const repo = repo_('hotels');
    const code = str_(payload.code).toUpperCase();
    const sameCode = repo.findBy('code', code).filter(function (h) { return h.hotel_id !== str_(payload.hotel_id); });
    if (sameCode.length) throw new AppError('VALIDATION', 'Invalid input', { code: 'already used by ' + sameCode[0].name });

    const fields = {};
    HOTEL_FIELDS.forEach(function (f) { fields[f] = f === 'active' ? payload.active !== false : str_(payload[f]); });
    fields.code = code;
    const now = nowIso_();
    let before = null;
    let after;

    if (payload.hotel_id) {
      before = repo.get(str_(payload.hotel_id));
      if (!before) throw new AppError('NOT_FOUND', 'Hotel not found');
      after = Object.assign({}, stripRow_(before), fields, { updated_at: now });
      repo.update(after);
    } else {
      after = Object.assign({ hotel_id: uuid_() }, fields, { created_at: now, updated_at: now });
      repo.insert(after);
    }
    writeAudit_(ctx, before ? 'hotels.update' : 'hotels.create', 'hotel', after.hotel_id, before, after, meta.requestId);
    cacheRemove_('hotels:all');
    return after;
  });
}
