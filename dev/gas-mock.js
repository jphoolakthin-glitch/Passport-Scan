/**
 * gas-mock.js — minimal in-memory stand-ins for the Apps Script services the
 * backend uses, so the real backend/*.gs code can run under Node for tests and
 * local development. Not shipped to Apps Script.
 *
 * Dev sign-in: token "dev:<email>" is accepted by the mocked tokeninfo endpoint.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function createGas(opts = {}) {
  const state = opts.state || { spreadsheets: {}, props: {}, nextId: 1 };
  const cache = new Map();
  const mail = [];
  const triggers = [];
  const clientId = opts.clientId || 'dev-client-id';

  function save() {
    if (opts.persistFile) fs.writeFileSync(opts.persistFile, JSON.stringify(state));
  }

  class Range {
    constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
    getRow() { return this.row; }
    getValues() {
      const out = [];
      for (let r = 0; r < this.nr; r++) {
        const src = this.sheet.data[this.row - 1 + r] || [];
        const line = [];
        for (let c = 0; c < this.nc; c++) { const v = src[this.col - 1 + c]; line.push(v === undefined ? '' : v); }
        out.push(line);
      }
      return out;
    }
    setValues(values) {
      if (values.length !== this.nr || values.some((l) => l.length !== this.nc)) throw new Error('setValues: dimensions mismatch');
      values.forEach((line, r) => {
        const idx = this.row - 1 + r;
        while (this.sheet.data.length <= idx) this.sheet.data.push([]);
        line.forEach((v, c) => { this.sheet.data[idx][this.col - 1 + c] = String(v); }); // sheet is plain-text formatted
      });
      save();
      return this;
    }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
    createTextFinder(text) {
      const range = this;
      let entire = false, matchCase = false;
      const finder = {
        matchEntireCell(b) { entire = b; return finder; },
        matchCase(b) { matchCase = b; return finder; },
        findAll() {
          const hits = [];
          const norm = (s) => (matchCase ? s : s.toLowerCase());
          range.getValues().forEach((line, r) => line.forEach((v, c) => {
            const a = norm(String(v)), b = norm(text);
            if (entire ? a === b : a.includes(b)) hits.push(new Range(range.sheet, range.row + r, range.col + c, 1, 1));
          }));
          return hits;
        },
      };
      return finder;
    }
  }

  class Sheet {
    constructor(raw) { this.raw = raw; }
    get data() { return this.raw.data; }
    getName() { return this.raw.name; }
    getRange(row, col, nr = 1, nc = 1) {
      if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error(`getRange: invalid (${row},${col},${nr},${nc})`);
      if (row + nr - 1 > this.getMaxRows()) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      return new Range(this, row, col, nr, nc);
    }
    getLastRow() {
      for (let i = this.data.length - 1; i >= 0; i--) if ((this.data[i] || []).some((v) => v !== '' && v !== undefined)) return i + 1;
      return 0;
    }
    getMaxRows() { return this.raw.maxRows || (this.raw.maxRows = opts.maxRows || 1000); }
    insertRowsAfter(after, n) { this.raw.maxRows = this.getMaxRows() + n; }
    deleteRow(r) { this.data.splice(r - 1, 1); save(); }
    setFrozenRows() {}
  }

  class Spreadsheet {
    constructor(raw) { this.raw = raw; }
    getId() { return this.raw.id; }
    getUrl() { return 'mock://spreadsheet/' + this.raw.id; }
    getSheets() { return this.raw.sheets.map((s) => new Sheet(s)); }
    getSheetByName(name) { const s = this.raw.sheets.find((x) => x.name === name); return s ? new Sheet(s) : null; }
    insertSheet(name) { const s = { name, data: [] }; this.raw.sheets.push(s); save(); return new Sheet(s); }
    deleteSheet(sheet) { this.raw.sheets = this.raw.sheets.filter((s) => s.name !== sheet.getName()); save(); }
  }

  const tz = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).reduce((o, p) => ((o[p.type] = p.value), o), {});
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const offMin = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
    const sign = offMin >= 0 ? '+' : '-';
    const off = sign + String(Math.floor(Math.abs(offMin) / 60)).padStart(2, '0') + ':' + String(Math.abs(offMin) % 60).padStart(2, '0');
    return { ...parts, off };
  };

  const globals = {
    console,
    SpreadsheetApp: {
      openById(id) { const raw = state.spreadsheets[id]; if (!raw) throw new Error('Spreadsheet not found: ' + id); return new Spreadsheet(raw); },
      create(name) { const id = 'ss' + state.nextId++; state.spreadsheets[id] = { id, name, sheets: [{ name: 'Sheet1', data: [] }] }; save(); return new Spreadsheet(state.spreadsheets[id]); },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in state.props ? state.props[k] : null),
        setProperty: (k, v) => { state.props[k] = String(v); save(); },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => { const e = cache.get(k); if (!e || e.exp < Date.now()) return null; return e.v; },
        put: (k, v, s) => { if (String(v).length > 100000) throw new Error('cache value too large'); cache.set(k, { v: String(v), exp: Date.now() + s * 1000 }); },
        remove: (k) => cache.delete(k),
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => [...crypto.createHash(alg).update(text, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      formatDate(date, timeZone, fmt) {
        const p = tz(date, timeZone);
        fmt = fmt.replace('SSS', String(date.getMilliseconds()).padStart(3, '0'));
        return fmt.replace("'T'", 'T').replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
          .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second).replace('XXX', p.off);
      },
    },
    UrlFetchApp: {
      fetch(url) {
        const m = /id_token=([^&]+)/.exec(url);
        const token = m ? decodeURIComponent(m[1]) : '';
        const ok = token.startsWith('dev:');
        const email = token.slice(4);
        const body = ok
          ? { aud: clientId, iss: 'https://accounts.google.com', email, email_verified: 'true', name: email.split('@')[0], exp: String(Math.floor(Date.now() / 1000) + 3600) }
          : { error: 'invalid_token' };
        return { getResponseCode: () => (ok ? 200 : 400), getContentText: () => JSON.stringify(body) };
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; }, getContent() { return text; } }),
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => opts.ownerEmail || 'owner@example.com' }) },
    MailApp: { sendEmail: (to, subject, body) => mail.push({ to, subject, body }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => {
        const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, inTimezone: () => b, create: () => { const t = { getHandlerFunction: () => fn }; triggers.push(t); return t; } };
        return b;
      },
    },
  };

  const context = vm.createContext(globals);
  const dir = path.join(__dirname, '..', 'backend');
  const source = fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort()
    .map((f) => `// ---- ${f}\n` + fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  // Export everything the tests need onto the context object.
  vm.runInContext(source + '\n;globalThis.__exports = { handleRequest_, setup, seedDemoData, runLicenseCheck, installTriggers, doGet, doPost, setProp_, getProp_ };', context);

  const api = context.__exports;
  api.state = state;
  api.mail = mail;
  api.triggers = triggers;
  api.clearCache = () => cache.clear();
  api.resetExecution = () => vm.runInContext('__spreadsheets = {}; __repos = {};', context);
  api.call = (action, payload, email) => {
    api.resetExecution(); // each HTTP request is a fresh execution in Apps Script
    return api.handleRequest_(JSON.stringify({ action, payload, token: email ? 'dev:' + email : undefined }));
  };
  return api;
}

module.exports = { createGas };
