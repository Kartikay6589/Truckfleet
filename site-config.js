/* ════════════════════════════════════════════
   TRUCKFLEET PRO — site-config.js
   One place to customize the whole site.
   Load this in <head> on every page (before the stylesheets finish
   painting) so the saved theme/accent apply without a flash.
════════════════════════════════════════════ */

/* ── 1. SITE SETTINGS — edit these values ── */
window.TFP_CONFIG = {
  supportEmail: 'crazytyagi01@gmail.com',
  supportPhone: '+91 9971690250',
  countryCode: '+91',            // prefixed to 10-digit phone numbers for SMS OTP

  // Where the backend API lives. On localhost this is '' (relative — the
  // Express server serves both the site and the API from one origin during
  // local dev). Once deployed, the frontend (Vercel) and backend (Render)
  // are on different domains, so this must be the Render URL.
  // ↓↓↓ Replace this with your own Render backend URL after deploying it ↓↓↓
  apiBaseUrl: (typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname))
    ? ''
    : 'https://YOUR-BACKEND-NAME.onrender.com',
  passwordMinLength: 10,         // used by sign up, change password and reset password
  passwordNeedsUppercase: true,
  allowedEmailDomain: 'gmail.com', // only accept this domain at sign up; '' = any valid email

  // Defaults for first-time visitors (each user can change them in Appearance settings)
  defaults: {
    theme: 'dark',               // 'dark' | 'light'
    accent: 'orange',            // key from accentPresets below
    customCursor: true,
    animations: true,
    fontScale: 1                 // 0.9 | 1 | 1.1 | 1.2
  },

  // Accent colour presets. Add your own: [main, dark, darker, light, lighter]
  accentPresets: {
    orange: { label: 'Orange', colors: ['#ed8936', '#dd6b20', '#c05621', '#f6ad55', '#fbd38d'] },
    blue:   { label: 'Blue',   colors: ['#3b82f6', '#2563eb', '#1d4ed8', '#60a5fa', '#bfdbfe'] },
    green:  { label: 'Green',  colors: ['#22c55e', '#16a34a', '#15803d', '#4ade80', '#bbf7d0'] },
    purple: { label: 'Purple', colors: ['#a855f7', '#9333ea', '#7e22ce', '#c084fc', '#e9d5ff'] },
    pink:   { label: 'Pink',   colors: ['#ec4899', '#db2777', '#be185d', '#f472b6', '#fbcfe8'] },
    teal:   { label: 'Teal',   colors: ['#14b8a6', '#0d9488', '#0f766e', '#2dd4bf', '#99f6e4'] },
    red:    { label: 'Red',    colors: ['#ef4444', '#dc2626', '#b91c1c', '#f87171', '#fecaca'] }
  }
};

/* ── 2. PREFERENCES ENGINE (no need to edit below) ── */
(function () {
  const CFG = window.TFP_CONFIG;
  const KEY = 'tfp_prefs';
  const root = document.documentElement;

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function load() {
    let saved = {};
    try { saved = JSON.parse(safeGet(KEY) || '{}') || {}; } catch (e) {}
    const prefs = Object.assign({}, CFG.defaults, saved);
    // Theme has always been stored separately under tfp_theme — keep that working
    prefs.theme = safeGet('tfp_theme') || prefs.theme;
    if (!CFG.accentPresets[prefs.accent]) prefs.accent = CFG.defaults.accent;
    return prefs;
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  // Styles for the preference toggles, injected so every page gets them
  const style = document.createElement('style');
  style.id = 'tfp-prefs-style';
  style.textContent = `
    html.no-custom-cursor body, html.no-custom-cursor * { cursor: auto; }
    html.no-custom-cursor a, html.no-custom-cursor button, html.no-custom-cursor [onclick],
    html.no-custom-cursor label, html.no-custom-cursor select { cursor: pointer; }
    html.no-custom-cursor input[type="text"], html.no-custom-cursor input[type="email"],
    html.no-custom-cursor input[type="password"], html.no-custom-cursor input[type="tel"],
    html.no-custom-cursor input[type="number"], html.no-custom-cursor textarea { cursor: text; }
    html.no-custom-cursor .cursor-circle, html.no-custom-cursor .cursor-dot { display: none !important; }
    html.reduce-motion *, html.reduce-motion *::before, html.reduce-motion *::after {
      animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important; scroll-behavior: auto !important;
    }
  `;
  (document.head || root).appendChild(style);

  function apply(prefs) {
    root.setAttribute('data-theme', prefs.theme);

    const c = CFG.accentPresets[prefs.accent].colors;
    root.style.setProperty('--accent-main', c[0]);
    root.style.setProperty('--accent-dark', c[1]);
    root.style.setProperty('--accent-darker', c[2]);
    root.style.setProperty('--accent-light', c[3]);
    root.style.setProperty('--accent-lighter', c[4]);
    root.style.setProperty('--accent-rgb', hexToRgb(c[0]));

    // Custom cursor makes no sense on touch screens
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    root.classList.toggle('no-custom-cursor', !prefs.customCursor || touch);
    root.classList.toggle('reduce-motion', !prefs.animations);
    root.style.fontSize = (Number(prefs.fontScale) || 1) * 100 + '%';
  }

  const prefs = load();
  apply(prefs);

  window.TFPPrefs = {
    get: () => Object.assign({}, prefs),
    set(changes) {
      Object.assign(prefs, changes);
      if (changes.theme) safeSet('tfp_theme', changes.theme);
      const { theme, ...rest } = prefs;
      safeSet(KEY, JSON.stringify(rest));
      apply(prefs);
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch (e) {}
      Object.assign(prefs, CFG.defaults, { theme: prefs.theme });
      apply(prefs);
    },
    presets: CFG.accentPresets
  };

  // Fill any element marked data-config="supportEmail" / "supportPhone"
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-config]').forEach(el => {
      const key = el.getAttribute('data-config');
      const val = CFG[key];
      if (!val) return;
      el.textContent = val;
      if (el.tagName === 'A') {
        el.href = key === 'supportEmail' ? `mailto:${val}` : `tel:${val.replace(/\s+/g, '')}`;
      }
    });
  });
})();

/* ── 3. SHARED HELPERS ── */
window.TFP = {
  // Escape user-entered text before putting it into innerHTML
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  passwordError(pw) {
    const C = window.TFP_CONFIG;
    if (pw.length < C.passwordMinLength || (C.passwordNeedsUppercase && !/[A-Z]/.test(pw))) {
      return `Password must be at least ${C.passwordMinLength} characters long` +
        (C.passwordNeedsUppercase ? ' and contain at least one uppercase letter.' : '.');
    }
    return '';
  },

  /* ── Session ──
     Real accounts now live on the server (backend/db.js). A session is a
     signed login token (JWT) plus a cached copy of the user's profile, so
     pages can show "Hi, Alice" without an extra round trip.
     "Remember me" → localStorage (survives browser restart),
     otherwise sessionStorage (cleared when the browser closes). */
  _store() {
    return localStorage.getItem('tfp_token') ? localStorage : sessionStorage;
  },
  getToken() {
    return localStorage.getItem('tfp_token') || sessionStorage.getItem('tfp_token');
  },
  getUser() {
    try { return JSON.parse(this._store().getItem('tfp_user') || 'null'); } catch (e) { return null; }
  },
  isLoggedIn() { return !!this.getToken(); },
  setSession(token, user, remember = true) {
    this.clearSession();
    const store = remember ? localStorage : sessionStorage;
    store.setItem('tfp_token', token);
    store.setItem('tfp_user', JSON.stringify(user));
  },
  setUser(user) {
    const store = this._store();
    if (store.getItem('tfp_token')) store.setItem('tfp_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('tfp_token');
    localStorage.removeItem('tfp_user');
    sessionStorage.removeItem('tfp_token');
    sessionStorage.removeItem('tfp_user');
  },

  /* Talk to backend/server.js. Always resolves to the parsed JSON body
     (with a `.status` field added) — check `.success` rather than catching,
     so callers don't need try/catch everywhere. A 401 on an authenticated
     request means the session expired: it's cleared and the user is sent
     back to the sign-in page automatically. */
  async api(path, { method = 'GET', body } = {}) {
    const token = this.getToken();
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;

    let res;
    try {
      res = await fetch(window.TFP_CONFIG.apiBaseUrl + path, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      return { success: false, status: 0, message: 'Could not reach the server. Make sure the backend is running.' };
    }

    let data = {};
    try { data = await res.json(); } catch (e) {}
    data.status = res.status;

    if (res.status === 401 && token) {
      this.clearSession();
      const onLanding = /(^|\/)index\.html$/.test(location.pathname) || location.pathname === '/';
      if (!onLanding) location.href = 'index.html';
    }
    return data;
  },

  /* OTP: uses backend/server.js (Twilio SMS) when the site is served by it.
     If the backend can't be reached (e.g. page opened straight from disk),
     falls back to a local demo code shown on screen. */
  otp: {
    _local: {},   // phone -> code, only used in demo fallback mode
    fullPhone(phone) { return window.TFP_CONFIG.countryCode + phone; },

    async send(phone) {
      const url = window.TFP_CONFIG.apiBaseUrl + '/api/send-otp';
      if (location.protocol !== 'file:') {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: this.fullPhone(phone) })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success) {
            return { ok: true, mode: 'server', devCode: data.mockOtp || null };
          }
          if (res.status !== 404) {
            return { ok: false, message: data.message || 'Could not send OTP. Please try again.' };
          }
        } catch (e) { /* backend not running — fall through to demo mode */ }
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      this._local[phone] = { code, expiresAt: Date.now() + 5 * 60 * 1000 };
      return { ok: true, mode: 'demo', devCode: code };
    },

    async verify(phone, code, mode) {
      if (mode === 'server') {
        try {
          const res = await fetch(window.TFP_CONFIG.apiBaseUrl + '/api/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: this.fullPhone(phone), otp: code })
          });
          const data = await res.json().catch(() => ({}));
          return { ok: !!data.success, message: data.message || 'Invalid OTP.' };
        } catch (e) {
          return { ok: false, message: 'Could not reach the server. Please try again.' };
        }
      }
      const entry = this._local[phone];
      if (!entry) return { ok: false, message: 'Please request an OTP first.' };
      if (Date.now() > entry.expiresAt) { delete this._local[phone]; return { ok: false, message: 'OTP has expired. Please resend.' }; }
      if (entry.code !== code) return { ok: false, message: 'Invalid OTP. Please try again.' };
      delete this._local[phone];
      return { ok: true };
    }
  }
};
