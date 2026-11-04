/**
 * AssetService.gs — PC / Scanner / Server records (flowchart steps 6–9).
 * Every save: permission check + validation on the server -> save -> Audit Log.
 */
const ASSET_FIELDS = [
  'hotel_id', 'type', 'name', 'brand', 'model', 'serial_number', 'ip_address',
  'location', 'status', 'license_name', 'license_expiry', 'notes',
];

function hotelAssets_(hotelId) {
  const key = 'assets:' + hotelId;
  const cached = cacheGet_(key);
  if (cached) return cached;
  const rows = repo_('assets').findBy('hotel_id', hotelId).map(stripRow_);
  cachePut_(key, rows, CONFIG.DATA_CACHE_SECONDS);
  return rows;
}

function filterAssets_(rows, payload) {
  const q = str_(payload.q);
  if (payload.type) rows = rows.filter(function (a) { return a.type === payload.type; });
  if (payload.status) rows = rows.filter(function (a) { return a.status === payload.status; });
  if (q) rows = rows.filter(function (a) { return includesText_([a.name, a.serial_number, a.model, a.brand, a.ip_address, a.location], q); });
  return rows;
}

/** assets.list — one hotel ({hotel_id}) or, without hotel_id, across every hotel the user can see. */
function assetsList_(payload, ctx) {
  let rows;
  if (payload.hotel_id) {
    requireHotelAccess_(ctx, str_(payload.hotel_id));
    rows = hotelAssets_(str_(payload.hotel_id));
  } else {
    rows = repo_('assets').all().map(stripRow_).filter(function (a) { return canAccessHotel_(ctx, a.hotel_id); });
  }
  rows = filterAssets_(rows, payload);
  const typeOrder = ENUMS.asset_type;
  rows.sort(function (a, b) {
    return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || a.name.localeCompare(b.name);
  });
  return paginate_(rows, payload);
}

function assetsGet_(payload, ctx) {
  const asset = repo_('assets').get(str_(payload.asset_id));
  if (!asset) throw new AppError('NOT_FOUND', 'Record not found');
  requireHotelAccess_(ctx, asset.hotel_id);
  return stripRow_(asset);
}

function validateAsset_(p) {
  const v = Validator_();
  v.required('hotel_id', p.hotel_id);
  v.required('type', p.type);
  v.oneOf('type', p.type, ENUMS.asset_type);
  v.required('name', p.name);
  v.maxLen('name', p.name, 120);
  ['brand', 'model', 'serial_number', 'location', 'license_name'].forEach(function (f) { v.maxLen(f, p[f], 120); });
  v.maxLen('notes', p.notes, 1000);
  v.oneOf('status', p.status, ENUMS.asset_status);
  v.date('license_expiry', p.license_expiry);
  v.pattern('ip_address', p.ip_address, /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$|^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$/, 'must be an IP address');
  if (str_(p.license_expiry) !== '' && str_(p.license_name) === '') v.add('license_name', 'required when license expiry is set');
  v.check();
}

/**
 * assets.save — create (no asset_id) or edit (asset_id + updated_at from the copy the user loaded).
 * A stale updated_at returns CONFLICT instead of silently overwriting someone else's edit.
 */
function assetsSave_(payload, ctx, meta) {
  const input = {};
  ASSET_FIELDS.forEach(function (f) { input[f] = str_(payload[f]); });
  input.type = input.type.toUpperCase();
  input.status = input.status || 'ACTIVE';
  validateAsset_(input);
  requireHotelAccess_(ctx, input.hotel_id);
  if (!allHotels_().some(function (h) { return h.hotel_id === input.hotel_id; })) {
    throw new AppError('VALIDATION', 'Invalid input', { hotel_id: 'hotel does not exist' });
  }

  return withLock_(function () {
    const repo = repo_('assets');
    const now = nowIso_();
    let before = null;
    let after;

    if (payload.asset_id) {
      before = repo.get(str_(payload.asset_id));
      if (!before) throw new AppError('NOT_FOUND', 'Record not found');
      requireHotelAccess_(ctx, before.hotel_id); // can't edit a record of a hotel you don't manage
      if (payload.updated_at && payload.updated_at !== before.updated_at) {
        throw new AppError('CONFLICT', 'Someone else changed this record. Reload and try again.', { current: stripRow_(before) });
      }
      after = Object.assign({}, stripRow_(before), input, { updated_at: now, updated_by: ctx.email });
      repo.update(after);
    } else {
      after = Object.assign({ asset_id: uuid_() }, input, {
        created_at: now, created_by: ctx.email, updated_at: now, updated_by: ctx.email,
      });
      repo.insert(after);
    }

    writeAudit_(ctx, before ? 'assets.update' : 'assets.create', 'asset', after.asset_id, before, after, meta.requestId);
    cacheRemove_('assets:' + after.hotel_id);
    if (before && before.hotel_id !== after.hotel_id) cacheRemove_('assets:' + before.hotel_id);
    return after;
  });
}
