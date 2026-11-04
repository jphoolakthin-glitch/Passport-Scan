/**
 * Util.gs — small helpers shared by every layer.
 */
/** ISO 8601 with milliseconds, e.g. 2026-11-04T14:18:00.123+07:00 (ms keep updated_at unique for conflict checks). */
function nowIso_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
}

function todayDate_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function uuid_() {
  return Utilities.getUuid();
}

function sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Whole days from date string a (YYYY-MM-DD) to b. */
function daysBetween_(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

function isValidDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const p = s.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

function isValidEmail_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function str_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** Accumulates field errors and throws one VALIDATION error. */
function Validator_() {
  const errors = {};
  return {
    required: function (field, value) {
      if (str_(value) === '') errors[field] = 'required';
    },
    maxLen: function (field, value, n) {
      if (str_(value).length > n) errors[field] = 'max ' + n + ' characters';
    },
    oneOf: function (field, value, list) {
      if (str_(value) !== '' && list.indexOf(value) === -1) errors[field] = 'must be one of ' + list.join(', ');
    },
    date: function (field, value) {
      if (str_(value) !== '' && !isValidDate_(str_(value))) errors[field] = 'must be a date YYYY-MM-DD';
    },
    email: function (field, value) {
      if (str_(value) !== '' && !isValidEmail_(str_(value))) errors[field] = 'must be an email';
    },
    pattern: function (field, value, re, msg) {
      if (str_(value) !== '' && !re.test(str_(value))) errors[field] = msg;
    },
    add: function (field, msg) { errors[field] = msg; },
    check: function () {
      if (Object.keys(errors).length) throw new AppError('VALIDATION', 'Invalid input', errors);
    },
  };
}

function paginate_(items, payload) {
  const size = Math.min(Math.max(parseInt(payload.pageSize, 10) || CONFIG.PAGE_SIZE, 1), CONFIG.MAX_PAGE_SIZE);
  const page = Math.max(parseInt(payload.page, 10) || 1, 1);
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), page: page, pageSize: size, total: items.length };
}

function pick_(obj, fields) {
  const out = {};
  fields.forEach(function (f) { if (Object.prototype.hasOwnProperty.call(obj, f)) out[f] = obj[f]; });
  return out;
}

function includesText_(haystacks, q) {
  const needle = q.toLowerCase();
  return haystacks.some(function (h) { return str_(h).toLowerCase().indexOf(needle) !== -1; });
}
