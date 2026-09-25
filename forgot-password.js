/* ════════════════════════════════════════════
   TRUCKFLEET PRO — forgot-password.js
   Forgot password: verify old password → set new
════════════════════════════════════════════ */

/* ── Theme ── */
const htmlEl   = document.documentElement;
const rippleEl = document.getElementById('theme-ripple');
const flashEl  = document.getElementById('theme-flash');

function applyTheme(theme, animate = false, originX = window.innerWidth / 2, originY = window.innerHeight / 2) {
  if (animate && rippleEl) {
    rippleEl.style.left = originX + 'px';
    rippleEl.style.top  = originY + 'px';
    rippleEl.className  = 'theme-ripple';
    flashEl.className   = 'theme-flash';
    void rippleEl.offsetWidth;
    rippleEl.className  = `theme-ripple to-${theme}`;
    flashEl.className   = `theme-flash flash-${theme}`;
    setTimeout(() => {
      htmlEl.setAttribute('data-theme', theme);
      document.getElementById('theme-icon').textContent = theme === 'dark' ? '🌙' : '☀️';
      localStorage.setItem('tfp_theme', theme);
    }, 200);
    rippleEl.addEventListener('animationend', () => { rippleEl.className = 'theme-ripple'; }, { once: true });
    flashEl.addEventListener('animationend',  () => { flashEl.className  = 'theme-flash';  }, { once: true });
  } else {
    htmlEl.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    localStorage.setItem('tfp_theme', theme);
  }
}
function toggleTheme() {
  const curr = htmlEl.getAttribute('data-theme') || 'dark';
  const next = curr === 'dark' ? 'light' : 'dark';
  const btn  = document.getElementById('theme-toggle');
  const rect = btn.getBoundingClientRect();
  applyTheme(next, true, rect.left + rect.width / 2, rect.top + rect.height / 2);
}
applyTheme(localStorage.getItem('tfp_theme') || 'dark', false);

/* ── Cursor ── */
const cc = document.getElementById('cursor-circle');
const cd = document.getElementById('cursor-dot');
let mx = 0, my = 0, cx = 0, cy = 0;
document.addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  cd.style.left = mx + 'px'; cd.style.top = my + 'px';
});
(function animCursor() {
  cx += (mx - cx) * 0.12; cy += (my - cy) * 0.12;
  cc.style.left = cx + 'px'; cc.style.top = cy + 'px';
  requestAnimationFrame(animCursor);
})();
document.addEventListener('mouseover', e => {
  if (['BUTTON','A','INPUT','SELECT'].includes(e.target.tagName)) cc.classList.add('hover');
});
document.addEventListener('mouseout', () => cc.classList.remove('hover'));

/* ════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════ */
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'fp-error show';
  setTimeout(() => { el.className = 'fp-error'; el.textContent = ''; }, 5000);
}

/* ════════════════════════════════════════════
   OTP AND PASSWORD RESET
════════════════════════════════════════════ */
let targetPhone = '';
let fpOtpMode = null;
let fpOtpNotifTimer = null;
let fpResendCooldownTimer = null;

/* On-screen OTP notification — only used when no real SMS is sent
   (demo mode, or backend running without Twilio credentials) */
function showOtpNotification(otp) {
  let existing = document.getElementById('otp-notif-overlay');
  if (existing) existing.remove();
  if (fpOtpNotifTimer) clearTimeout(fpOtpNotifTimer);

  const overlay = document.createElement('div');
  overlay.className = 'otp-notif-overlay';
  overlay.id = 'otp-notif-overlay';
  overlay.innerHTML = `
    <div class="otp-notif-card">
      <div class="otp-notif-icon">📲</div>
      <p class="otp-notif-title">Demo Verification Code</p>
      <div class="otp-notif-code-wrap">
        <span class="otp-notif-code-label">Your OTP Code</span>
        <span class="otp-notif-code">${TFP.esc(otp)}</span>
      </div>
      <p class="otp-notif-hint">SMS isn't configured, so the code is shown here.<br>This notification will auto-dismiss in 8 seconds.</p>
      <div class="otp-notif-timer"><div class="otp-notif-timer-bar"></div></div>
      <button class="otp-notif-close" onclick="dismissOtpNotification()">Got it</button>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('show'));
  });
  fpOtpNotifTimer = setTimeout(() => dismissOtpNotification(), 8000);
}

function dismissOtpNotification() {
  const overlay = document.getElementById('otp-notif-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 400);
  }
  if (fpOtpNotifTimer) { clearTimeout(fpOtpNotifTimer); fpOtpNotifTimer = null; }
}

function stopFPCooldown() {
  if (fpResendCooldownTimer) { clearInterval(fpResendCooldownTimer); fpResendCooldownTimer = null; }
  const btn = document.getElementById('fp-resend-btn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<span class="resend-icon">↻</span> Resend Code'; }
}
function startFPCooldown(seconds = 30) {
  const btn = document.getElementById('fp-resend-btn');
  stopFPCooldown();
  let left = seconds;
  btn.disabled = true;
  btn.innerHTML = `<span class="resend-icon">↻</span> Resend in ${left}s`;
  fpResendCooldownTimer = setInterval(() => {
    left--;
    if (left <= 0) stopFPCooldown();
    else btn.innerHTML = `<span class="resend-icon">↻</span> Resend in ${left}s`;
  }, 1000);
}

async function sendOTP(e) {
  e.preventDefault();
  const phone = document.getElementById('fp-phone').value.trim();

  if (!/^\d{10}$/.test(phone)) {
    showError('fp-error-1', '❌ Please enter a valid 10-digit phone number.');
    return;
  }

  const btn = document.getElementById('fp-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  const check = await TFP.api(`/api/auth/check-phone/${encodeURIComponent(phone)}`);
  if (!check.exists) {
    btn.disabled = false;
    btn.textContent = 'Send OTP →';
    showError('fp-error-1', '❌ No account found with that phone number.');
    return;
  }

  btn.textContent = 'Sending...';
  const result = await TFP.otp.send(phone);
  btn.disabled = false;
  btn.textContent = 'Send OTP →';

  if (!result.ok) {
    showError('fp-error-1', `❌ ${result.message}`);
    return;
  }

  fpOtpMode = result.mode;
  targetPhone = phone;
  if (result.devCode) showOtpNotification(result.devCode);
  else showToast(`OTP sent to ${TFP_CONFIG.countryCode} ${phone}`, 'success');

  document.getElementById('step-1').classList.add('fp-hidden');
  const step2 = document.getElementById('step-2');
  step2.classList.remove('fp-hidden');
  step2.style.animation = 'cardIn .4s cubic-bezier(.4,0,.2,1)';
  startFPCooldown();
}

async function resendFPOTP() {
  const btn = document.getElementById('fp-resend-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="resend-icon">↻</span> Resending...';

  const result = await TFP.otp.send(targetPhone);
  if (!result.ok) {
    showError('fp-error-2', `❌ ${result.message}`);
    stopFPCooldown();
    return;
  }
  fpOtpMode = result.mode;
  if (result.devCode) showOtpNotification(result.devCode);
  else showToast(`OTP sent to ${TFP_CONFIG.countryCode} ${targetPhone}`, 'success');
  startFPCooldown();
}

async function verifyOTP(e) {
  e.preventDefault();
  const otp = document.getElementById('fp-otp').value.trim();
  const result = await TFP.otp.verify(targetPhone, otp, fpOtpMode);

  if (result.ok) {
    stopFPCooldown();
    document.getElementById('step-2').classList.add('fp-hidden');
    const step3 = document.getElementById('step-3');
    step3.classList.remove('fp-hidden');
    step3.style.animation = 'cardIn .4s cubic-bezier(.4,0,.2,1)';
  } else {
    showError('fp-error-2', `❌ ${result.message}`);
  }
}

async function resetPassword(e) {
  e.preventDefault();
  const newPass = document.getElementById('fp-new-pass').value;
  const confirmPass = document.getElementById('fp-confirm-pass').value;

  if (newPass !== confirmPass) {
    showError('fp-error-3', '❌ Passwords do not match.');
    return;
  }
  const pwError = TFP.passwordError(newPass);
  if (pwError) {
    showError('fp-error-3', `❌ ${pwError}`);
    return;
  }

  const btn = document.getElementById('fp-reset-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  const result = await TFP.api('/api/auth/reset-password', {
    method: 'POST',
    body: { phone: targetPhone, newPassword: newPass }
  });
  btn.disabled = false;
  btn.textContent = 'Save New Password →';

  if (!result.success) {
    showError('fp-error-3', `❌ ${result.message || 'Could not reset your password. Please try again.'}`);
    return;
  }

  document.getElementById('step-3').classList.add('fp-hidden');
  const step4 = document.getElementById('step-4');
  step4.classList.remove('fp-hidden');
  step4.style.animation = 'cardIn .4s cubic-bezier(.4,0,.2,1)';
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  document.getElementById('toast-icon').textContent = icons[type] || '✅';
  document.getElementById('toast-msg').textContent  = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}
