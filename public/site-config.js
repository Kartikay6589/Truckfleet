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
  }
};
