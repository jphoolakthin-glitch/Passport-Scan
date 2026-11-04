/**
 * api.js — the ONLY file that knows where the backend is.
 * Every screen calls Api.*; on migration (e.g. to Supabase) only this file changes.
 *
 * Request:  POST {action, token, payload, requestId} as text/plain (avoids the CORS preflight Apps Script can't answer)
 * Response: {ok:true, data} | {ok:false, error:{code, message, details}}
 */
class ApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details || null;
  }
}

const Api = (() => {
  async function call(action, payload = {}) {
    let res;
    try {
      res = await fetch(window.APP_CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload, token: Auth.getToken(), requestId: crypto.randomUUID() }),
        redirect: 'follow',
      });
    } catch (e) {
      throw new ApiError('NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    }
    let body;
    try {
      body = await res.json();
    } catch (e) {
      throw new ApiError('NETWORK', 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (ตรวจสอบ API_URL และการ Deploy)');
    }
    if (!body.ok) {
      const err = new ApiError(body.error.code, body.error.message, body.error.details);
      if (err.code === 'UNAUTHENTICATED') Auth.expired();
      throw err;
    }
    return body.data;
  }

  return {
    call,
    me: () => call('auth.me'),
    dashboard: { summary: () => call('dashboard.summary') },
    hotels: {
      search: (p) => call('hotels.search', p),
      get: (hotel_id) => call('hotels.get', { hotel_id }),
      save: (h) => call('hotels.save', h),
    },
    assets: {
      list: (p) => call('assets.list', p),
      get: (asset_id) => call('assets.get', { asset_id }),
      save: (a) => call('assets.save', a),
    },
    alerts: {
      list: (p) => call('alerts.list', p),
      update: (alert_id, status) => call('alerts.update', { alert_id, status }),
    },
    users: { list: (p) => call('users.list', p), save: (u) => call('users.save', u) },
    audit: { list: (p) => call('audit.list', p) },
    admin: { clearCache: () => call('admin.clearCache'), runLicenseCheck: () => call('admin.runLicenseCheck') },
  };
})();
