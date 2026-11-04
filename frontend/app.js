/**
 * app.js — screens. Talks to the backend only through Api (api.js).
 * Routes: #/dashboard  #/hotels  #/hotel/<id>  #/alerts  #/users  #/audit
 */
const App = { me: null, routeSeq: 0 };

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const can = (action) => !!App.me && (App.me.permissions.includes('*') || App.me.permissions.includes(action));

const TYPE_LABEL = { PC: 'PC', SCANNER: 'Scanner', SERVER: 'Server' };
const STATUS_LABEL = { ACTIVE: 'ใช้งาน', REPAIR: 'ส่งซ่อม', INACTIVE: 'ไม่ได้ใช้งาน', RETIRED: 'ปลดระวาง' };
const ALERT_STATUS_LABEL = { OPEN: 'รอดำเนินการ', ACKNOWLEDGED: 'รับทราบแล้ว', RESOLVED: 'แก้ไขแล้ว' };
const ACTION_LABEL = {
  'assets.create': 'เพิ่มอุปกรณ์', 'assets.update': 'แก้ไขอุปกรณ์', 'hotels.create': 'เพิ่มโรงแรม', 'hotels.update': 'แก้ไขโรงแรม',
  'users.create': 'เพิ่มผู้ใช้', 'users.update': 'แก้ไขผู้ใช้', 'alerts.update': 'อัปเดตการแจ้งเตือน', 'job.licenseCheck': 'ตรวจ License อัตโนมัติ',
};
const FIELD_LABEL = {
  hotel_id: 'โรงแรม', type: 'ประเภท', name: 'ชื่ออุปกรณ์', brand: 'ยี่ห้อ', model: 'รุ่น', serial_number: 'Serial number',
  ip_address: 'IP address', location: 'ตำแหน่งที่ติดตั้ง', status: 'สถานะ', license_name: 'License', license_expiry: 'License หมดอายุ',
  notes: 'หมายเหตุ', code: 'รหัสโรงแรม', province: 'จังหวัด', address: 'ที่อยู่', contact_name: 'ผู้ติดต่อ', contact_phone: 'เบอร์ติดต่อ',
  email: 'อีเมล', role: 'Role', hotels: 'โรงแรมที่ดูแล', active: 'เปิดใช้งาน',
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return isNaN(d) ? iso : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtDateTime = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? esc(iso) : d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const daysChip = (days) => {
  if (days === null || days === undefined) return '';
  if (days < 0) return `<span class="chip danger">หมดอายุแล้ว ${-days} วัน</span>`;
  if (days === 0) return '<span class="chip danger">หมดอายุวันนี้</span>';
  return `<span class="chip ${days <= 7 ? 'danger' : 'warn'}">เหลือ ${days} วัน</span>`;
};
const daysLeft = (date) => {
  if (!date) return null;
  const t = new Date(); const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86400000);
};

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

/** Server validation messages are English (stable for any client); show them in Thai. */
function thaiMsg(m) {
  const rules = [
    [/^required$/, 'จำเป็นต้องกรอก'], [/^max (\d+) characters$/, 'ไม่เกิน $1 ตัวอักษร'], [/^must be one of (.+)$/, 'ต้องเป็นหนึ่งใน $1'],
    [/^must be a date YYYY-MM-DD$/, 'วันที่ไม่ถูกต้อง'], [/^must be an email$/, 'อีเมลไม่ถูกต้อง'], [/^must be an IP address$/, 'IP address ไม่ถูกต้อง'],
    [/^required when license expiry is set$/, 'ต้องระบุชื่อ License เมื่อกรอกวันหมดอายุ'], [/^hotel does not exist$/, 'ไม่พบโรงแรมนี้'],
    [/^already used by (.+)$/, 'รหัสนี้ถูกใช้แล้วโดย $1'], [/^you cannot remove your own admin access$/, 'ไม่สามารถลดสิทธิ์ admin ของตัวเองได้'],
    [/^unknown role; roles are: (.+)$/, 'ไม่มี Role นี้ (มี: $1)'], [/^unknown hotel ids: (.+)$/, 'ไม่พบโรงแรม: $1'],
    [/^Account (.+) does not have access\. Ask an admin to add you\.$/, 'บัญชี $1 ยังไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ'],
    [/^You do not have permission for (.+)$/, 'คุณไม่มีสิทธิ์ทำรายการนี้ ($1)'], [/^You do not have access to this hotel$/, 'คุณไม่มีสิทธิ์เข้าถึงโรงแรมนี้'],
    [/^The system is busy, please try again$/, 'ระบบกำลังทำงาน กรุณาลองใหม่อีกครั้ง'], [/^Record not found$/, 'ไม่พบรายการ'],
  ];
  for (const [re, th] of rules) if (re.test(m)) return m.replace(re, th);
  return m;
}

function errorBox(err) {
  return `<div class="banner error">${esc(thaiMsg(err.message || String(err)))}</div>`;
}

function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- table + pager ---------- */
function renderTable(cols, rows, emptyText) {
  if (!rows.length) return `<div class="table-wrap"><div class="empty">${esc(emptyText || 'ไม่พบข้อมูล')}</div></div>`;
  return `<div class="table-wrap"><table>
    <thead><tr>${cols.map((c) => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr data-i="${i}" class="${cols.clickable ? 'clickable' : ''}">${cols.map((c) => `<td class="${c.cls || ''}">${c.html ? c.html(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function renderPager(p) {
  if (p.total <= p.pageSize) return `<div class="pager"><span>${p.total} รายการ</span></div>`;
  const pages = Math.ceil(p.total / p.pageSize);
  return `<div class="pager"><span>${p.total} รายการ · หน้า ${p.page}/${pages}</span><span>
    <button class="btn small" data-page="${p.page - 1}" ${p.page <= 1 ? 'disabled' : ''}>ก่อนหน้า</button>
    <button class="btn small" data-page="${p.page + 1}" ${p.page >= pages ? 'disabled' : ''}>ถัดไป</button></span></div>`;
}

function bindRows(el, rows, onClick) {
  $$('tbody tr', el).forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    onClick(rows[+tr.dataset.i]);
  }));
}

function bindPager(el, onPage) {
  $$('[data-page]', el).forEach((b) => b.addEventListener('click', () => onPage(+b.dataset.page)));
}

/* ---------- modal form ---------- */
function field(name, value, opts = {}) {
  const label = opts.label || FIELD_LABEL[name] || name;
  const req = opts.required ? 'required' : '';
  const dis = opts.readonly ? 'disabled' : '';
  let input;
  if (opts.options) {
    input = `<select name="${name}" ${req} ${dis}>${opts.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else if (opts.textarea) {
    input = `<textarea name="${name}" rows="3" ${dis}>${esc(value)}</textarea>`;
  } else {
    input = `<input name="${name}" type="${opts.type || 'text'}" value="${esc(value)}" ${req} ${dis} ${opts.attrs || ''}>`;
  }
  return `<div class="field ${opts.full ? 'full' : ''}"><label>${esc(label)}${opts.required ? ' *' : ''}</label>${input}<span class="err" data-err="${name}"></span></div>`;
}

/**
 * Opens the modal. onSubmit(values) returns a promise; VALIDATION errors are shown
 * next to their fields, other errors in a banner. Resolves true when saved.
 */
function openModal({ title, body, submitLabel = 'บันทึก', readonly = false, onSubmit, onOpen }) {
  const dlg = $('#modal');
  const form = $('#modal-form');
  form.innerHTML = `<h2>${esc(title)}</h2>${body}<div id="modal-msg"></div>
    <div class="form-actions"><button type="button" class="btn ghost" data-close>${readonly ? 'ปิด' : 'ยกเลิก'}</button>
    ${readonly ? '' : `<button class="btn primary" value="save">${esc(submitLabel)}</button>`}</div>`;
  $('[data-close]', form).addEventListener('click', () => dlg.close());
  if (onOpen) onOpen(form);
  dlg.showModal();
  return new Promise((resolve) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      $$('[data-err]', form).forEach((s) => (s.textContent = ''));
      $('#modal-msg').innerHTML = '';
      const btn = $('button[value=save]', form);
      btn.disabled = true;
      try {
        await onSubmit(form);
        dlg.close();
        resolve(true);
      } catch (err) {
        if (err.code === 'VALIDATION' && err.details) {
          Object.entries(err.details).forEach(([f, m]) => {
            const s = $(`[data-err="${f}"]`, form);
            if (s) s.textContent = thaiMsg(m); else $('#modal-msg').innerHTML += errorBox(`${FIELD_LABEL[f] || f}: ${thaiMsg(m)}`);
          });
        } else {
          $('#modal-msg').innerHTML = errorBox(err);
        }
      } finally {
        btn.disabled = false;
      }
    };
    dlg.addEventListener('close', () => resolve(false), { once: true });
  });
}

function formValues(form, names) {
  const out = {};
  names.forEach((n) => { const el = form.elements[n]; if (el) out[n] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
  return out;
}

/* ---------- views ---------- */
const Views = {};

Views.dashboard = async (view) => {
  view.innerHTML = '<div class="page-head"><h1>แดชบอร์ด</h1></div><p class="muted">กำลังโหลด…</p>';
  const s = await Api.dashboard.summary();
  const stat = (label, value, cls = '') => `<div class="stat ${cls}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;
  view.innerHTML = `
    <div class="page-head"><h1>แดชบอร์ด</h1><a class="btn" href="#/hotels">ค้นหาโรงแรม</a></div>
    <div class="stats">
      ${stat('โรงแรม', s.hotels)}${stat('อุปกรณ์ทั้งหมด', s.assets)}
      ${stat('PC', s.byType.PC || 0)}${stat('Scanner', s.byType.SCANNER || 0)}${stat('Server', s.byType.SERVER || 0)}
      ${stat('การแจ้งเตือนที่รอดำเนินการ', s.openAlerts, s.openAlerts ? 'alert' : '')}
    </div>
    <div class="page-head"><h2>License ที่หมดอายุแล้วหรือจะหมดใน ${s.alertDaysBefore} วัน (${s.expiringTotal})</h2>
      <a href="#/alerts">ดูการแจ้งเตือนทั้งหมด</a></div>
    <div id="exp"></div>`;
  const cols = [
    { label: 'โรงแรม', key: 'hotel_name' },
    { label: 'อุปกรณ์', html: (r) => `${esc(r.name)} <span class="chip">${esc(TYPE_LABEL[r.type])}</span>` },
    { label: 'License', key: 'license_name', cls: 'hide-sm' },
    { label: 'หมดอายุ', html: (r) => esc(fmtDate(r.license_expiry)) },
    { label: '', html: (r) => daysChip(r.days_left) },
  ];
  cols.clickable = true;
  $('#exp').innerHTML = renderTable(cols, s.expiring, 'ไม่มี License ที่ใกล้หมดอายุ');
  bindRows($('#exp'), s.expiring, (r) => (location.hash = '#/hotel/' + r.hotel_id));
};

Views.hotels = async (view) => {
  const state = { q: '', page: 1 };
  view.innerHTML = `
    <div class="page-head"><h1>โรงแรม</h1>${can('hotels.save') ? '<button class="btn primary" id="add">เพิ่มโรงแรม</button>' : ''}</div>
    <div class="toolbar"><input id="q" type="search" placeholder="ค้นหาชื่อ รหัส หรือจังหวัด" style="flex:1;max-width:420px" aria-label="ค้นหาโรงแรม"></div>
    <div id="list"><p class="muted">กำลังโหลด…</p></div>`;
  const load = async () => {
    const list = $('#list');
    try {
      const p = await Api.hotels.search({ q: state.q, page: state.page, includeInactive: can('hotels.save') });
      const cols = [
        { label: 'รหัส', key: 'code' },
        { label: 'ชื่อโรงแรม', html: (r) => esc(r.name) + (r.active ? '' : ' <span class="chip">ปิดใช้งาน</span>') },
        { label: 'จังหวัด', key: 'province' },
      ];
      cols.clickable = true;
      list.innerHTML = renderTable(cols, p.items, state.q ? 'ไม่พบโรงแรมที่ตรงกับคำค้น' : 'ยังไม่มีโรงแรม') + renderPager(p);
      bindRows(list, p.items, (r) => (location.hash = '#/hotel/' + r.hotel_id));
      bindPager(list, (pg) => { state.page = pg; load(); });
    } catch (err) { list.innerHTML = errorBox(err); }
  };
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  if ($('#add')) $('#add').addEventListener('click', async () => { if (await editHotel({ active: true })) load(); });
  $('#q').focus();
  load();
};

function editHotel(h) {
  return openModal({
    title: h.hotel_id ? 'แก้ไขโรงแรม' : 'เพิ่มโรงแรม',
    body: `<div class="form-grid">
      ${field('code', h.code, { required: true })}${field('name', h.name, { required: true, label: 'ชื่อโรงแรม' })}
      ${field('province', h.province)}${field('contact_name', h.contact_name)}
      ${field('contact_phone', h.contact_phone)}${field('active', h.active ? 'true' : 'false', { options: [['true', 'เปิดใช้งาน'], ['false', 'ปิดใช้งาน']] })}
      ${field('address', h.address, { full: true, textarea: true })}</div>`,
    onSubmit: async (form) => {
      const v = formValues(form, ['code', 'name', 'province', 'contact_name', 'contact_phone', 'address', 'active']);
      await Api.hotels.save({ ...v, active: v.active === 'true', hotel_id: h.hotel_id });
      toast('บันทึกโรงแรมแล้ว');
    },
  });
}

Views.hotel = async (view, hotelId) => {
  const state = { type: '', q: '', page: 1 };
  view.innerHTML = '<p class="muted">กำลังโหลด…</p>';
  let hotel = await Api.hotels.get(hotelId);
  const head = () => `
    <p><a href="#/hotels">← โรงแรมทั้งหมด</a></p>
    <div class="page-head"><div><h1>${esc(hotel.name)}</h1>
      <div class="muted">${esc([hotel.code, hotel.province, hotel.contact_name, hotel.contact_phone].filter(Boolean).join(' · '))}</div></div>
      <div class="toolbar" style="margin:0">
        ${can('hotels.save') ? '<button class="btn" id="edit-hotel">แก้ไขโรงแรม</button>' : ''}
        ${can('assets.save') ? '<button class="btn primary" id="add">เพิ่มอุปกรณ์</button>' : ''}</div></div>`;
  view.innerHTML = `<div id="head">${head()}</div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="ประเภท">${[['', 'ทั้งหมด'], ['PC', 'PC'], ['SCANNER', 'Scanner'], ['SERVER', 'Server']]
        .map(([v, l]) => `<button type="button" data-type="${v}" class="${v === '' ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input id="q" type="search" placeholder="ค้นหาชื่อ, Serial, IP" aria-label="ค้นหาอุปกรณ์">
    </div>
    <div id="list"><p class="muted">กำลังโหลด…</p></div>`;

  const load = async () => {
    const list = $('#list');
    try {
      const p = await Api.assets.list({ hotel_id: hotelId, type: state.type, q: state.q, page: state.page });
      const cols = [
        { label: 'ประเภท', html: (r) => `<span class="chip">${esc(TYPE_LABEL[r.type])}</span>` },
        { label: 'ชื่อ', key: 'name' },
        { label: 'Serial', key: 'serial_number', cls: 'hide-sm' },
        { label: 'IP', key: 'ip_address', cls: 'hide-sm' },
        { label: 'สถานะ', html: (r) => `<span class="chip ${r.status === 'ACTIVE' ? 'ok' : ''}">${esc(STATUS_LABEL[r.status] || r.status)}</span>` },
        { label: 'License หมดอายุ', html: (r) => r.license_expiry ? `${esc(fmtDate(r.license_expiry))} ${daysLeft(r.license_expiry) <= 30 ? daysChip(daysLeft(r.license_expiry)) : ''}` : '<span class="muted">–</span>' },
      ];
      cols.clickable = true;
      list.innerHTML = renderTable(cols, p.items, 'ยังไม่มีอุปกรณ์') + renderPager(p);
      bindRows(list, p.items, async (r) => { if (await editAsset(r, hotel)) load(); });
      bindPager(list, (pg) => { state.page = pg; load(); });
    } catch (err) { list.innerHTML = errorBox(err); }
  };

  const bindHead = () => {
    if ($('#add')) $('#add').addEventListener('click', async () => { if (await editAsset({ hotel_id: hotelId, type: state.type || 'PC', status: 'ACTIVE' }, hotel)) load(); });
    if ($('#edit-hotel')) $('#edit-hotel').addEventListener('click', async () => {
      if (await editHotel(hotel)) { hotel = await Api.hotels.get(hotelId); $('#head').innerHTML = head(); bindHead(); }
    });
  };
  bindHead();
  $$('[data-type]', view).forEach((b) => b.addEventListener('click', () => {
    $$('[data-type]', view).forEach((x) => x.classList.toggle('on', x === b));
    state.type = b.dataset.type; state.page = 1; load();
  }));
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  load();
};

function editAsset(a, hotel) {
  const readonly = !can('assets.save');
  const isNew = !a.asset_id;
  const o = (map) => Object.entries(map);
  return openModal({
    title: isNew ? `เพิ่มอุปกรณ์ · ${hotel.name}` : `${readonly ? '' : 'แก้ไข '}${a.name}`,
    readonly,
    body: `<div class="form-grid">
      ${field('type', a.type, { options: o(TYPE_LABEL), required: true, readonly })}
      ${field('status', a.status || 'ACTIVE', { options: o(STATUS_LABEL), readonly })}
      ${field('name', a.name, { required: true, full: true, readonly, attrs: 'placeholder="เช่น Front desk PC 1"' })}
      ${field('brand', a.brand, { readonly })}${field('model', a.model, { readonly })}
      ${field('serial_number', a.serial_number, { readonly })}${field('ip_address', a.ip_address, { readonly })}
      ${field('location', a.location, { full: true, readonly })}
      ${field('license_name', a.license_name, { readonly, attrs: 'placeholder="เช่น Windows 11 Pro"' })}
      ${field('license_expiry', a.license_expiry, { type: 'date', readonly })}
      ${field('notes', a.notes, { full: true, textarea: true, readonly })}</div>
      ${isNew ? '' : `<p class="muted small">แก้ไขล่าสุด ${fmtDateTime(a.updated_at)} โดย ${esc(a.updated_by)}</p>`}`,
    onSubmit: async (form) => {
      const v = formValues(form, ['type', 'status', 'name', 'brand', 'model', 'serial_number', 'ip_address', 'location', 'license_name', 'license_expiry', 'notes']);
      try {
        await Api.assets.save({ ...v, hotel_id: a.hotel_id, asset_id: a.asset_id, updated_at: a.updated_at });
      } catch (err) {
        if (err.code === 'CONFLICT') {
          err.message = 'มีผู้อื่นแก้ไขรายการนี้ไปก่อนแล้ว กรุณาปิดหน้าต่างแล้วเปิดรายการใหม่เพื่อดูข้อมูลล่าสุด';
        }
        throw err;
      }
      toast(isNew ? 'เพิ่มอุปกรณ์แล้ว' : 'บันทึกการแก้ไขแล้ว');
    },
  });
}

Views.alerts = async (view) => {
  const state = { status: 'OPEN', page: 1 };
  view.innerHTML = `
    <div class="page-head"><h1>การแจ้งเตือน License</h1>
      ${can('admin.runLicenseCheck') ? '<button class="btn" id="run">ตรวจสอบตอนนี้</button>' : ''}</div>
    <div class="toolbar"><div class="seg" role="group" aria-label="สถานะ">${[['OPEN', 'รอดำเนินการ'], ['ACKNOWLEDGED', 'รับทราบแล้ว'], ['RESOLVED', 'แก้ไขแล้ว'], ['', 'ทั้งหมด']]
      .map(([v, l]) => `<button type="button" data-status="${v}" class="${v === 'OPEN' ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div id="list"><p class="muted">กำลังโหลด…</p></div>`;
  const load = async () => {
    const list = $('#list');
    try {
      const p = await Api.alerts.list({ status: state.status, page: state.page });
      const canUpd = can('alerts.update');
      const cols = [
        { label: 'โรงแรม', html: (r) => `<a href="#/hotel/${esc(r.hotel_id)}">${esc(r.hotel_name)}</a>` },
        { label: 'รายละเอียด', key: 'message' },
        { label: 'หมดอายุ', html: (r) => `${esc(fmtDate(r.license_expiry))}<br>${daysChip(daysLeft(r.license_expiry))}` },
        { label: 'สถานะ', html: (r) => esc(ALERT_STATUS_LABEL[r.status]) },
      ];
      if (canUpd) cols.push({ label: '', html: (r) => r.status === 'RESOLVED' ? '' :
        (r.status === 'OPEN' ? `<button class="btn small" data-ack="${esc(r.alert_id)}">รับทราบ</button> ` : '') +
        `<button class="btn small" data-resolve="${esc(r.alert_id)}">แก้ไขแล้ว</button>` });
      list.innerHTML = renderTable(cols, p.items, 'ไม่มีการแจ้งเตือน') + renderPager(p);
      bindPager(list, (pg) => { state.page = pg; load(); });
      $$('[data-ack],[data-resolve]', list).forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await Api.alerts.update(b.dataset.ack || b.dataset.resolve, b.dataset.ack ? 'ACKNOWLEDGED' : 'RESOLVED');
          toast('อัปเดตแล้ว'); load();
        } catch (err) { toast(thaiMsg(err.message)); b.disabled = false; }
      }));
    } catch (err) { list.innerHTML = errorBox(err); }
  };
  $$('[data-status]', view).forEach((b) => b.addEventListener('click', () => {
    $$('[data-status]', view).forEach((x) => x.classList.toggle('on', x === b));
    state.status = b.dataset.status; state.page = 1; load();
  }));
  if ($('#run')) $('#run').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = await Api.admin.runLicenseCheck();
      toast(`ตรวจ ${r.checked} รายการ · ใหม่ ${r.created} · ปิด ${r.resolved}`); load();
    } catch (err) { toast(thaiMsg(err.message)); } finally { e.target.disabled = false; }
  });
  load();
};

Views.users = async (view) => {
  const state = { q: '', page: 1 };
  view.innerHTML = `
    <div class="page-head"><h1>ผู้ใช้งาน</h1><button class="btn primary" id="add">เพิ่มผู้ใช้</button></div>
    <p class="muted small">ผู้ใช้เข้าสู่ระบบด้วย Gmail ของตัวเอง เฉพาะอีเมลที่อยู่ในรายการนี้และเปิดใช้งานเท่านั้นที่เข้าระบบได้</p>
    <div class="toolbar"><input id="q" type="search" placeholder="ค้นหาอีเมล ชื่อ หรือ Role" aria-label="ค้นหาผู้ใช้"></div>
    <div id="list"><p class="muted">กำลังโหลด…</p></div>`;
  let roles = [];
  const hotelsAll = [];
  for (let page = 1; ; page++) { // 200–300 hotels = 2 pages
    const r = await Api.hotels.search({ page, pageSize: 200, includeInactive: true });
    hotelsAll.push(...r.items);
    if (hotelsAll.length >= r.total || !r.items.length) break;
  }
  const hotelName = Object.fromEntries(hotelsAll.map((h) => [h.hotel_id, h.name]));
  const load = async () => {
    const list = $('#list');
    try {
      const p = await Api.users.list({ q: state.q, page: state.page });
      roles = p.roles;
      const cols = [
        { label: 'อีเมล', key: 'email' }, { label: 'ชื่อ', key: 'name' }, { label: 'Role', key: 'role' },
        { label: 'โรงแรมที่ดูแล', html: (u) => u.hotels.includes('*') ? 'ทุกโรงแรม' : u.hotels.length ? esc(u.hotels.map((id) => hotelName[id] || id).join(', ')) : '<span class="muted">–</span>' },
        { label: 'สถานะ', html: (u) => u.active ? '<span class="chip ok">ใช้งาน</span>' : '<span class="chip">ปิด</span>' },
      ];
      cols.clickable = true;
      list.innerHTML = renderTable(cols, p.items) + renderPager(p);
      bindRows(list, p.items, async (u) => { if (await editUser(u, roles, hotelsAll)) load(); });
      bindPager(list, (pg) => { state.page = pg; load(); });
    } catch (err) { list.innerHTML = errorBox(err); }
  };
  $('#add').addEventListener('click', async () => { if (await editUser({ active: true, hotels: [], role: roles.includes('viewer') ? 'viewer' : roles[0] }, roles, hotelsAll)) load(); });
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  load();
};

function editUser(u, roles, hotels) {
  const isNew = !u.email;
  const all = u.hotels.includes('*');
  return openModal({
    title: isNew ? 'เพิ่มผู้ใช้' : 'แก้ไขผู้ใช้',
    body: `<div class="form-grid">
      ${field('email', u.email, { type: 'email', required: true, readonly: !isNew, full: true })}
      ${field('name', u.name, { label: 'ชื่อ' })}
      ${field('role', u.role, { options: roles.map((r) => [r, r]), required: true })}
      ${field('active', u.active ? 'true' : 'false', { options: [['true', 'เปิดใช้งาน'], ['false', 'ปิดใช้งาน']] })}
      <div class="field full"><label>โรงแรมที่ดูแล</label>
        <label class="small"><input type="checkbox" name="all_hotels" ${all ? 'checked' : ''}> ทุกโรงแรม</label>
        <input type="search" id="hq" placeholder="กรองรายชื่อโรงแรม" aria-label="กรองรายชื่อโรงแรม">
        <div class="checklist" id="hl">${hotels.map((h) => `<label data-name="${esc((h.name + ' ' + h.code).toLowerCase())}"><input type="checkbox" name="hotel" value="${esc(h.hotel_id)}" ${u.hotels.includes(h.hotel_id) ? 'checked' : ''}> ${esc(h.name)} <span class="muted small">${esc(h.code)}</span></label>`).join('')}</div>
        <span class="err" data-err="hotels"></span></div></div>`,
    onOpen: (form) => {
      const sync = () => { $('#hl', form).style.opacity = form.elements.all_hotels.checked ? 0.4 : 1; };
      form.elements.all_hotels.addEventListener('change', sync); sync();
      $('#hq', form).addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        $$('#hl label', form).forEach((l) => { l.hidden = q && !l.dataset.name.includes(q); });
      });
    },
    onSubmit: async (form) => {
      const v = formValues(form, ['email', 'name', 'role', 'active']);
      const chosen = $$('input[name=hotel]:checked', form).map((c) => c.value);
      await Api.users.save({ email: v.email || u.email, name: v.name, role: v.role, active: v.active === 'true',
        hotels: form.elements.all_hotels.checked ? ['*'] : chosen });
      toast('บันทึกผู้ใช้แล้ว');
    },
  });
}

Views.audit = async (view) => {
  const state = { entity: '', page: 1 };
  view.innerHTML = `
    <div class="page-head"><h1>ประวัติการแก้ไข (Audit Log)</h1></div>
    <div class="toolbar"><select id="entity" aria-label="ประเภทข้อมูล"><option value="">ทุกประเภท</option><option value="asset">อุปกรณ์</option>
      <option value="hotel">โรงแรม</option><option value="user">ผู้ใช้</option><option value="alert">การแจ้งเตือน</option><option value="job">งานอัตโนมัติ</option></select></div>
    <div id="list"><p class="muted">กำลังโหลด…</p></div>`;
  const changes = (r) => {
    if (!r.before) return r.entity === 'job' ? esc(JSON.stringify(r.after)) : '<span class="muted">สร้างใหม่</span>';
    const keys = Object.keys(r.after || {}).filter((k) => !['updated_at', 'updated_by'].includes(k) && JSON.stringify(r.before[k]) !== JSON.stringify(r.after[k]));
    return keys.length ? keys.map((k) => `${esc(FIELD_LABEL[k] || k)}: <s class="muted">${esc(r.before[k])}</s> → ${esc(r.after[k])}`).join('<br>') : '<span class="muted">ไม่มีการเปลี่ยนแปลง</span>';
  };
  const load = async () => {
    const list = $('#list');
    try {
      const p = await Api.audit.list({ entity: state.entity, page: state.page });
      const cols = [
        { label: 'เวลา', html: (r) => fmtDateTime(r.timestamp) }, { label: 'ผู้ใช้', key: 'user_email' },
        { label: 'การกระทำ', html: (r) => esc(ACTION_LABEL[r.action] || r.action) },
        { label: 'รายการ', html: (r) => esc((r.after && (r.after.name || r.after.email || r.after.message)) || r.entity_id) },
        { label: 'การเปลี่ยนแปลง', html: changes },
      ];
      list.innerHTML = renderTable(cols, p.items) + renderPager(p);
      bindPager(list, (pg) => { state.page = pg; load(); });
    } catch (err) { list.innerHTML = errorBox(err); }
  };
  $('#entity').addEventListener('change', (e) => { state.entity = e.target.value; state.page = 1; load(); });
  load();
};

/* ---------- shell + routing ---------- */
const NAV = [
  ['dashboard', 'แดชบอร์ด', 'dashboard.summary'],
  ['hotels', 'โรงแรม', 'hotels.search'],
  ['alerts', 'การแจ้งเตือน', 'alerts.list'],
  ['users', 'ผู้ใช้งาน', 'users.list'],
  ['audit', 'Audit Log', 'audit.list'],
];

function renderNav(current) {
  $('#nav').innerHTML = NAV.filter(([, , perm]) => can(perm))
    .map(([id, label]) => `<a href="#/${id}" class="${current === id || (current === 'hotel' && id === 'hotels') ? 'active' : ''}">${label}</a>`).join('');
}

async function route() {
  if (!App.me) return;
  const seq = ++App.routeSeq;
  const [, name = 'dashboard', param] = (location.hash || '#/dashboard').split('/');
  const view = $('#view');
  const fn = Views[name];
  const perm = { dashboard: 'dashboard.summary', hotels: 'hotels.search', hotel: 'hotels.get', alerts: 'alerts.list', users: 'users.list', audit: 'audit.list' }[name];
  renderNav(name);
  if (!fn || !can(perm)) {
    const first = NAV.find(([, , p]) => can(p));
    if (first && name !== first[0]) { location.hash = '#/' + first[0]; return; }
    view.innerHTML = '<div class="card">คุณยังไม่มีสิทธิ์เข้าถึงหน้าใด กรุณาติดต่อผู้ดูแลระบบ</div>';
    return;
  }
  try {
    await fn(view, param && decodeURIComponent(param));
  } catch (err) {
    if (seq === App.routeSeq && err.code !== 'UNAUTHENTICATED') view.innerHTML = errorBox(err);
  }
  view.focus({ preventScroll: true });
}

function showLogin(msg) {
  App.me = null;
  $('#shell').hidden = true;
  $('#login').hidden = false;
  const m = $('#login-msg');
  m.hidden = !msg;
  m.textContent = msg || '';
  Auth.renderButton($('#signin'));
}

async function enterApp() {
  try {
    App.me = await Api.me();
  } catch (err) {
    if (err.code !== 'UNAUTHENTICATED') { Auth.signOut(); showLogin(thaiMsg(err.message)); }
    return;
  }
  $('#login').hidden = true;
  $('#shell').hidden = false;
  $('#me-email').textContent = `${App.me.email} · ${App.me.role}`;
  route();
}

$('#signout').addEventListener('click', () => Auth.signOut());
window.addEventListener('hashchange', route);
Auth.init((signedIn, msg) => (signedIn ? enterApp() : showLogin(msg)));
if (Auth.getToken()) enterApp(); else showLogin();
