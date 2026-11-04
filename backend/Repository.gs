/**
 * Repository.gs — the ONLY layer that touches SpreadsheetApp.
 * On migration to another database, this file is what gets rewritten;
 * Services keep calling the same methods.
 */
var __spreadsheets = {};

function spreadsheetFor_(file) {
  if (!__spreadsheets[file]) {
    const id = requireProp_(file === 'audit' ? 'AUDIT_SPREADSHEET_ID' : 'DATA_SPREADSHEET_ID');
    __spreadsheets[file] = SpreadsheetApp.openById(id);
  }
  return __spreadsheets[file];
}

function toCell_(type, v) {
  if (v === null || v === undefined) return '';
  switch (type) {
    case 'bool': return v === true || v === 'TRUE' || v === 'true' ? 'TRUE' : 'FALSE';
    case 'json': return typeof v === 'string' ? v : JSON.stringify(v);
    default: return String(v);
  }
}

function fromCell_(type, v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, CONFIG.TIMEZONE, type === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  switch (type) {
    case 'bool': return v === true || String(v).toUpperCase() === 'TRUE';
    case 'int': return v === '' || v === null ? null : Number(v);
    case 'json':
      if (v === '' || v === null) return null;
      try { return JSON.parse(v); } catch (e) { return v; }
    default: return v === null || v === undefined ? '' : String(v);
  }
}

class Repository {
  constructor(table) {
    if (!SCHEMA[table]) throw new AppError('INTERNAL', 'Unknown table ' + table);
    this.table = table;
    this.def = SCHEMA[table];
    this.names = columnNames_(table);
    this._sheet = null;
  }

  sheet_() {
    if (!this._sheet) {
      const sh = spreadsheetFor_(this.def.file).getSheetByName(this.table);
      if (!sh) throw new AppError('CONFIG', 'Sheet "' + this.table + '" is missing. Run setup().');
      const header = sh.getRange(1, 1, 1, this.names.length).getValues()[0].map(String);
      if (header.join('|') !== this.names.join('|')) {
        throw new AppError('CONFIG', 'Sheet "' + this.table + '" header does not match the schema. Expected: ' + this.names.join(', '));
      }
      this._sheet = sh;
    }
    return this._sheet;
  }

  rowToObj_(values, rowNumber) {
    const obj = {};
    this.def.columns.forEach(function (c, i) { obj[c[0]] = fromCell_(c[1], values[i]); });
    Object.defineProperty(obj, '_row', { value: rowNumber, enumerable: false, writable: true });
    return obj;
  }

  objToRow_(obj) {
    return this.def.columns.map(function (c) { return toCell_(c[1], obj[c[0]]); });
  }

  /** Reads the whole table. Use for small tables, or where a full scan is needed. */
  all() {
    const sh = this.sheet_();
    const last = sh.getLastRow();
    if (last < 2) return [];
    const values = sh.getRange(2, 1, last - 1, this.names.length).getValues();
    const self = this;
    return values
      .map(function (v, i) { return self.rowToObj_(v, i + 2); })
      .filter(function (o) { return str_(o[self.def.key]) !== ''; });
  }

  /** Exact-match lookup on one column with TextFinder: reads only the matching rows. */
  findBy(column, value) {
    const col = this.names.indexOf(column) + 1;
    if (col < 1) throw new AppError('INTERNAL', 'Unknown column ' + column);
    const sh = this.sheet_();
    const last = sh.getLastRow();
    if (last < 2 || str_(value) === '') return [];
    const hits = sh.getRange(2, col, last - 1, 1)
      .createTextFinder(String(value)).matchEntireCell(true).matchCase(true).findAll();
    const self = this;
    return hits.map(function (r) {
      const row = r.getRow();
      return self.rowToObj_(sh.getRange(row, 1, 1, self.names.length).getValues()[0], row);
    });
  }

  findOne(column, value) {
    return this.findBy(column, value)[0] || null;
  }

  get(key) {
    return this.findOne(this.def.key, key);
  }

  insert(obj) {
    this.insertMany([obj]);
    return obj;
  }

  insertMany(objs) {
    if (!objs.length) return;
    const sh = this.sheet_();
    const rows = objs.map(this.objToRow_.bind(this));
    const start = sh.getLastRow() + 1;
    const need = start + rows.length - 1 - sh.getMaxRows();
    if (need > 0) {
      // A new sheet has 1,000 rows; writing past the end throws, so grow in chunks and keep cells plain text.
      const add = Math.max(need, 500);
      const from = sh.getMaxRows() + 1;
      sh.insertRowsAfter(sh.getMaxRows(), add);
      sh.getRange(from, 1, add, this.names.length).setNumberFormat('@');
    }
    sh.getRange(start, 1, rows.length, this.names.length).setValues(rows);
  }

  /** Updates the row with the same key. Returns the stored object. */
  update(obj) {
    const existing = obj._row ? obj : this.get(obj[this.def.key]);
    if (!existing) throw new AppError('NOT_FOUND', this.table + ' ' + obj[this.def.key] + ' not found');
    this.sheet_().getRange(existing._row, 1, 1, this.names.length).setValues([this.objToRow_(obj)]);
    return obj;
  }

  deleteWhere(column, value) {
    const rows = this.findBy(column, value).map(function (o) { return o._row; }).sort(function (a, b) { return b - a; });
    const sh = this.sheet_();
    rows.forEach(function (r) { sh.deleteRow(r); });
    return rows.length;
  }
}

/** One Repository instance per table per execution. */
var __repos = {};
function repo_(table) {
  if (!__repos[table]) __repos[table] = new Repository(table);
  return __repos[table];
}
