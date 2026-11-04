/**
 * auth.js — "Sign in with Google" (Google Identity Services).
 * Keeps the Google ID token in sessionStorage (cleared when the tab closes).
 * The token itself is verified on the server for every request; nothing here is trusted.
 */
const Auth = (() => {
  const KEY = 'psms.idToken';
  let onChange = () => {};
  let gisReady = false;

  function decodeExp(token) {
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(part)).exp * 1000;
    } catch (e) {
      return Date.now() + 3600 * 1000; // dev tokens are not JWTs
    }
  }

  function store(token) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ token, exp: decodeExp(token) })); } catch (e) { /* private mode */ }
    memo = { token, exp: decodeExp(token) };
  }

  let memo = null;
  function read() {
    if (memo) return memo;
    try { memo = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { memo = null; }
    return memo;
  }

  function getToken() {
    const t = read();
    return t && t.exp > Date.now() + 30000 ? t.token : null;
  }

  function clear() {
    memo = null;
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  function renderButton(el) {
    el.innerHTML = '';
    if (window.APP_CONFIG.DEV_LOGIN) {
      el.innerHTML = `
        <form class="dev-login">
          <p class="muted">โหมดทดสอบ (dev server): พิมพ์อีเมลที่มีในตาราง users</p>
          <input name="email" type="email" required value="owner@example.com" aria-label="อีเมล">
          <button class="btn primary">เข้าสู่ระบบ</button>
        </form>`;
      el.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        store('dev:' + e.target.email.value.trim().toLowerCase());
        onChange(true);
      });
      return;
    }
    const draw = () => {
      google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'th', shape: 'pill' });
    };
    if (gisReady) draw(); else el.dataset.pending = '1';
  }

  function init(callback) {
    onChange = callback;
    if (window.APP_CONFIG.DEV_LOGIN) return;
    const start = () => {
      google.accounts.id.initialize({
        client_id: window.APP_CONFIG.GOOGLE_CLIENT_ID,
        callback: (resp) => { store(resp.credential); onChange(true); },
        auto_select: true, // returning users are signed in again with one tap or none
        cancel_on_tap_outside: false,
      });
      gisReady = true;
      document.querySelectorAll('[data-pending]').forEach((el) => { delete el.dataset.pending; renderButton(el); });
    };
    if (window.google && google.accounts) start();
    else window.addEventListener('gis-loaded', start, { once: true });
  }

  /** Called by api.js when the server rejects the token (expired after ~1 h). */
  function expired() {
    clear();
    onChange(false, 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
    if (gisReady) google.accounts.id.prompt();
  }

  function signOut() {
    clear();
    if (gisReady) google.accounts.id.disableAutoSelect();
    onChange(false);
  }

  return { init, getToken, renderButton, expired, signOut };
})();
