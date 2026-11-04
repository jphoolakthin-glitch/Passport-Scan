/**
 * UserService.gs — user registry and hotel assignment (admin only).
 */
function rolesList_() {
  const roles = {};
  repo_('role_permissions').all().forEach(function (r) {
    (roles[r.role] = roles[r.role] || []).push(r.action);
  });
  return roles;
}

function usersList_(payload) {
  const hotelsByUser = {};
  repo_('user_hotels').all().forEach(function (r) {
    (hotelsByUser[r.user_email] = hotelsByUser[r.user_email] || []).push(r.hotel_id);
  });
  let rows = repo_('users').all().map(stripRow_);
  if (payload.q) rows = rows.filter(function (u) { return includesText_([u.email, u.name, u.role], str_(payload.q)); });
  rows.forEach(function (u) { u.hotels = hotelsByUser[u.email] || []; });
  rows.sort(function (a, b) { return a.email.localeCompare(b.email); });
  const page = paginate_(rows, payload);
  page.roles = Object.keys(rolesList_()).sort();
  return page;
}

/** users.save — {email, name, role, active, hotels: ['*'] | [hotel_id, ...]} */
function usersSave_(payload, ctx, meta) {
  const email = str_(payload.email).toLowerCase();
  const roles = rolesList_();
  const hotels = Array.isArray(payload.hotels) ? payload.hotels.map(str_).filter(String) : null;
  const v = Validator_();
  v.required('email', email);
  v.email('email', email);
  v.required('role', payload.role);
  if (payload.role && !roles[payload.role]) v.add('role', 'unknown role; roles are: ' + Object.keys(roles).join(', '));
  if (email === ctx.email && (payload.active === false || payload.role !== ctx.role)) {
    v.add('role', 'you cannot remove your own admin access');
  }
  if (hotels) {
    const known = {};
    allHotels_().forEach(function (h) { known[h.hotel_id] = true; });
    const unknown = hotels.filter(function (id) { return id !== '*' && !known[id]; });
    if (unknown.length) v.add('hotels', 'unknown hotel ids: ' + unknown.join(', '));
  }
  v.check();

  return withLock_(function () {
    const repo = repo_('users');
    const now = nowIso_();
    const before = repo.get(email);
    const after = Object.assign({}, before ? stripRow_(before) : { email: email, created_at: now }, {
      name: str_(payload.name),
      role: payload.role,
      active: payload.active !== false,
      updated_at: now,
    });
    if (before) repo.update(after); else repo.insert(after);

    let beforeHotels = null;
    if (hotels) {
      const map = repo_('user_hotels');
      beforeHotels = map.findBy('user_email', email).map(function (r) { return r.hotel_id; });
      map.deleteWhere('user_email', email);
      map.insertMany(hotels.map(function (id) { return { id: uuid_(), user_email: email, hotel_id: id }; }));
    }

    writeAudit_(ctx, before ? 'users.update' : 'users.create', 'user', email,
      before ? Object.assign(stripRow_(before), beforeHotels ? { hotels: beforeHotels } : {}) : null,
      Object.assign({}, after, hotels ? { hotels: hotels } : {}), meta.requestId);
    clearUserContext_(email);
    return Object.assign({}, after, { hotels: hotels || beforeHotels || [] });
  });
}
