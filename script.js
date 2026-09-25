/* ================================================
   TRUCKFLEET PRO — script.js  v2.0
   Landing page: theme, cursor, auth, animations
   ================================================ */

/* ---- Redirect if already logged in ---- */
if (TFP.isLoggedIn()) {
  window.location.href = 'dashboard.html';
}

/* ---- Theme System ---- */
const themeToggle = document.getElementById('theme-toggle');
const themeIcon   = document.getElementById('theme-icon');
const htmlEl      = document.documentElement;
const rippleEl    = document.getElementById('theme-ripple');
const flashEl     = document.getElementById('theme-flash');

function applyTheme(theme, animate = false, originX = window.innerWidth / 2, originY = window.innerHeight / 2) {
  if (animate && rippleEl) {
    // Position ripple at origin point
    rippleEl.style.left = originX + 'px';
    rippleEl.style.top  = originY + 'px';
    // Reset animation
    rippleEl.className = 'theme-ripple';
    flashEl.className  = 'theme-flash';
    void rippleEl.offsetWidth; // force reflow
    // Fire animations
    rippleEl.className = `theme-ripple to-${theme}`;
    flashEl.className  = `theme-flash flash-${theme}`;
    // Apply theme slightly after ripple starts (so it looks like ripple reveals the new theme)
    setTimeout(() => {
      htmlEl.setAttribute('data-theme', theme);
      themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
      localStorage.setItem('tfp_theme', theme);
    }, 200);
    // Clean up
    rippleEl.addEventListener('animationend', () => { rippleEl.className = 'theme-ripple'; }, { once: true });
    flashEl.addEventListener('animationend',  () => { flashEl.className  = 'theme-flash';  }, { once: true });
  } else {
    htmlEl.setAttribute('data-theme', theme);
    themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
    localStorage.setItem('tfp_theme', theme);
  }
}

// Load saved theme (no animation on load)
const savedTheme = localStorage.getItem('tfp_theme') || 'dark';
applyTheme(savedTheme, false);

themeToggle.addEventListener('click', (e) => {
  const current = htmlEl.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  const rect    = themeToggle.getBoundingClientRect();
  applyTheme(next, true, rect.left + rect.width / 2, rect.top + rect.height / 2);
});

/* ---- Custom Cursor Circle ---- */
const cursorCircle = document.getElementById('cursor-circle');
const cursorDot = document.getElementById('cursor-dot');
let mouseX = 0, mouseY = 0;
let circleX = 0, circleY = 0;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  // Dot follows instantly
  cursorDot.style.left = mouseX + 'px';
  cursorDot.style.top = mouseY + 'px';
});

// Smooth circle lag effect
function animateCursor() {
  const ease = 0.12;
  circleX += (mouseX - circleX) * ease;
  circleY += (mouseY - circleY) * ease;
  cursorCircle.style.left = circleX + 'px';
  cursorCircle.style.top = circleY + 'px';
  requestAnimationFrame(animateCursor);
}
animateCursor();

// Expand on hover over interactive elements (checks ancestors too, so hovering
// the text/icon inside a button still counts)
document.addEventListener('mouseover', (e) => {
  const interactive = e.target.closest('button, a, input, select, label, .custom-select-trigger, .custom-option, .feature-card, .truck-card');
  cursorCircle.classList.toggle('hover', !!interactive);
});

/* ---- Navbar scroll effect ---- */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 50);
});

/* ---- Mobile hamburger menu ---- */
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');
const navActions = document.querySelector('.nav-actions');

hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  navActions.classList.toggle('open');
  const spans = hamburger.querySelectorAll('span');
  if (navLinks.classList.contains('open')) {
    spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
    spans[1].style.opacity = '0';
    spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
  } else {
    spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
  }
});

/* ---- Particle system ---- */
function createParticles() {
  const container = document.getElementById('hero-particles');
  if (!container) return;
  for (let i = 0; i < 45; i++) {
    const p = document.createElement('div');
    p.classList.add('particle');
    p.style.left = Math.random() * 100 + '%';
    p.style.width = p.style.height = (Math.random() * 4 + 2) + 'px';
    p.style.animationDuration = (Math.random() * 14 + 8) + 's';
    p.style.animationDelay = (Math.random() * 12) + 's';
    p.style.opacity = Math.random() * 0.25 + 0.05;
    container.appendChild(p);
  }
}
createParticles();

/* ---- Counter animation ---- */
function animateCounters() {
  document.querySelectorAll('.stat-number').forEach(counter => {
    const target = parseInt(counter.getAttribute('data-target'));
    const step = target / (2000 / 16);
    let current = 0;
    function update() {
      current += step;
      if (current < target) { counter.textContent = Math.floor(current).toLocaleString() + '+'; requestAnimationFrame(update); }
      else counter.textContent = target.toLocaleString() + '+';
    }
    update();
  });
}
const heroStats = document.querySelector('.hero-stats');
if (heroStats) {
  // Run once — previously it restarted every time the stats scrolled back into view
  const statsObs = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) { animateCounters(); statsObs.disconnect(); }
  }, { threshold: 0.3 });
  statsObs.observe(heroStats);
}

/* ---- Scroll reveal ---- */
const revealEls = document.querySelectorAll('.feature-card, .step-card, .cta-card, .section-header');
revealEls.forEach(el => el.classList.add('reveal'));
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
revealEls.forEach(el => revealObs.observe(el));

/* ---- Feature card mouse glow ---- */
document.querySelectorAll('.feature-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const glow = card.querySelector('.feature-glow');
    glow.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(var(--accent-rgb),0.25) 0%, transparent 60%)`;
    glow.style.opacity = '1';
  });
  card.addEventListener('mouseleave', () => { card.querySelector('.feature-glow').style.opacity = '0'; });
});

/* ---- Truck card 3D tilt ---- */
document.querySelectorAll('.truck-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(600px) rotateX(${-y * 8}deg) rotateY(${x * 8}deg) scale(1.03)`;
  });
  card.addEventListener('mouseleave', () => { card.style.transform = ''; });
});

/* ---- CAPTCHA Logic ---- */
let captchaData = { signin: '', signup: '' };

function generateCaptchaText(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

window.refreshCaptcha = function(type) {
  const canvas = document.getElementById(`captcha-canvas-${type}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear and fill background
  ctx.clearRect(0, 0, width, height);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  ctx.fillStyle = isLight ? '#f8fafc' : '#0f172a';
  ctx.fillRect(0, 0, width, height);
  
  // Generate text
  const text = generateCaptchaText();
  captchaData[type] = text;
  
  // Draw noise dots
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Draw noise lines
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * width, Math.random() * height);
    ctx.lineTo(Math.random() * width, Math.random() * height);
    ctx.stroke();
  }
  
  // Draw text
  ctx.font = 'bold 24px Outfit, sans-serif';
  ctx.textBaseline = 'middle';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const x = 15 + (i * 20);
    const y = height / 2;
    const angle = (Math.random() - 0.5) * 0.5;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = isLight ? '#0f1f3d' : '#f0f4f8';
    
    // Randomize slight vertical offset
    ctx.fillText(char, 0, (Math.random() - 0.5) * 10);
    ctx.restore();
  }
};

/* ---- Modal logic ---- */
function openModal(type) {
  document.getElementById(`modal-${type}`).classList.add('active');
  document.body.style.overflow = 'hidden';
  if (type === 'signin' || type === 'signup') refreshCaptcha(type);
}
function closeModal(type) {
  document.getElementById(`modal-${type}`).classList.remove('active');
  document.body.style.overflow = '';
  if (type === 'signup' && typeof resetSignupForm === 'function') resetSignupForm();
  
  // Clear input
  const captchaInput = document.getElementById(`${type}-captcha`);
  if (captchaInput) captchaInput.value = '';
}
function closeModalOnOverlay(e, type) { if (e.target === e.currentTarget) closeModal(type); }
function switchModal(toType) {
  const from = toType === 'signup' ? 'signin' : 'signup';
  closeModal(from);
  setTimeout(() => openModal(toType), 200);
}
function handleForgotPwd(email, btn) {
  console.log(`Sending reset link to ${email}...`);
  setTimeout(() => {
    btn.innerHTML = 'Reset Link Sent! ✉️';
    btn.style.background = 'var(--green)';
    btn.style.borderColor = 'var(--green)';
    setTimeout(() => closeModal('forgot-pwd'), 1500);
  }, 1200);
}

/* ---- Password Toggle ---- */
window.togglePasswordVisibility = function(inputId, toggleBtnId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(toggleBtnId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
};

/* ---- Custom Animated Error Modal ---- */
window.showAnimatedError = function(message) {
  let overlay = document.getElementById('custom-error-overlay');
  
  // Create it dynamically if it doesn't exist
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.id = 'custom-error-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <div class="cb-icon" style="font-size: 3.5rem; animation: shakeError 0.5s ease-out forwards;">⚠️</div>
        <h3 class="cb-title" style="color: var(--red);">Action Required</h3>
        <p class="cb-message" id="custom-error-message"></p>
        <div class="cb-actions">
          <button class="cb-btn cb-btn-cancel" onclick="closeCustomError()">Got it</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const msgEl = document.getElementById('custom-error-message');
  msgEl.textContent = message;
  
  // Use a tiny timeout to ensure DOM update before adding 'show' class for the transition
  setTimeout(() => {
    overlay.classList.add('show');
    // Briefly shake the icon
    const icon = overlay.querySelector('.cb-icon');
    if(icon) {
      icon.style.animation = 'none';
      // trigger reflow
      void icon.offsetWidth;
      icon.style.animation = 'shakeError 0.5s ease-out forwards';
    }
  }, 10);
};

window.closeCustomError = function() {
  const overlay = document.getElementById('custom-error-overlay');
  if (overlay) overlay.classList.remove('show');
};
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // Only close what is actually open (closing signup also wipes the form)
  ['signin', 'signup'].forEach(t => {
    if (document.getElementById(`modal-${t}`).classList.contains('active')) closeModal(t);
  });
  closeCustomError();
});

/* ---- Toast ---- */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  const toastIcon = document.getElementById('toast-icon');
  toastMsg.textContent = message;
  toast.className = `toast ${type}`;
  toastIcon.textContent = type === 'success' ? '✅' : '❌';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function showFormError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

/* ---- Sign Up ---- */
/* ════════════════════════════════════════════
   OTP VERIFICATION LOGIC
════════════════════════════════════════════ */
let isPhoneVerified = false;
let otpMode = null;        // 'server' (backend/Twilio) or 'demo' (local fallback)
let otpNotifTimer = null;
let resendCooldownTimer = null;

/* On-screen OTP notification — only used when no real SMS is sent
   (demo mode, or backend running without Twilio credentials) */
function showOtpNotification(otp) {
  let existing = document.getElementById('otp-notif-overlay');
  if (existing) existing.remove();
  if (otpNotifTimer) clearTimeout(otpNotifTimer);

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
  otpNotifTimer = setTimeout(() => dismissOtpNotification(), 8000);
}

function dismissOtpNotification() {
  const overlay = document.getElementById('otp-notif-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 400);
  }
  if (otpNotifTimer) { clearTimeout(otpNotifTimer); otpNotifTimer = null; }
}

/* 30-second cooldown on the resend button so the SMS can't be spammed */
function startResendCooldown(seconds = 30) {
  const btn = document.getElementById('btn-resend-phone');
  stopResendCooldown();
  let left = seconds;
  btn.disabled = true;
  btn.innerHTML = `<span class="resend-icon">↻</span> Resend in ${left}s`;
  resendCooldownTimer = setInterval(() => {
    left--;
    if (left <= 0) stopResendCooldown();
    else btn.innerHTML = `<span class="resend-icon">↻</span> Resend in ${left}s`;
  }, 1000);
}
function stopResendCooldown() {
  if (resendCooldownTimer) { clearInterval(resendCooldownTimer); resendCooldownTimer = null; }
  const btn = document.getElementById('btn-resend-phone');
  if (btn) { btn.disabled = false; btn.innerHTML = '<span class="resend-icon">↻</span> Resend Code'; }
}

async function deliverOtp(phone) {
  const result = await TFP.otp.send(phone);
  if (!result.ok) { showAnimatedError(result.message); return false; }
  otpMode = result.mode;
  if (result.devCode) showOtpNotification(result.devCode);
  else showToast(`OTP sent to ${TFP_CONFIG.countryCode} ${phone}`, 'success');
  startResendCooldown();
  return true;
}

async function sendOtp(type) {
  if (type !== 'phone') return;
  const phoneInput = document.getElementById('signup-phone');
  const btn = document.getElementById('btn-verify-phone');

  // Second click while the number is locked = "Change number"
  if (phoneInput.disabled && !isPhoneVerified) { changeSignupPhone(); return; }

  const phone = phoneInput.value.trim();
  if (!/^\d{10}$/.test(phone)) {
    showAnimatedError('Please enter a valid 10-digit phone number before verifying.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';
  const ok = await deliverOtp(phone);
  btn.disabled = false;
  btn.textContent = ok ? 'Change' : 'Verify';
  if (!ok) return;

  document.getElementById('otp-container-phone').style.display = 'block';
  phoneInput.disabled = true;
  document.getElementById('otp-input-phone').focus();
}

function changeSignupPhone() {
  const phoneInput = document.getElementById('signup-phone');
  phoneInput.disabled = false;
  document.getElementById('otp-container-phone').style.display = 'none';
  document.getElementById('otp-input-phone').value = '';
  document.getElementById('btn-verify-phone').textContent = 'Verify';
  stopResendCooldown();
  otpMode = null;
  phoneInput.focus();
}

async function resendOtp(type) {
  if (type !== 'phone') return;
  const btn = document.getElementById('btn-resend-phone');
  btn.disabled = true;
  btn.innerHTML = '<span class="resend-icon">↻</span> Resending...';
  const ok = await deliverOtp(document.getElementById('signup-phone').value.trim());
  if (!ok) stopResendCooldown();
}

async function verifyOtp(type) {
  if (type !== 'phone') return;
  const enteredOtp = document.getElementById(`otp-input-${type}`).value.trim();
  if (!/^\d{6}$/.test(enteredOtp)) {
    showAnimatedError('Please enter the 6-digit OTP.');
    return;
  }
  const phone = document.getElementById('signup-phone').value.trim();
  const result = await TFP.otp.verify(phone, enteredOtp, otpMode);

  if (result.ok) {
    isPhoneVerified = true;
    dismissOtpNotification();
    stopResendCooldown();
    document.getElementById(`otp-container-${type}`).style.display = 'none';
    const btn = document.getElementById(`btn-verify-${type}`);
    btn.innerHTML = '✅ Verified';
    btn.classList.add('verified');
    btn.disabled = true;
  } else {
    showAnimatedError(result.message);
  }
}

// Reset OTP states when closing signup
function resetSignupForm() {
  document.getElementById('form-signup').reset();

  isPhoneVerified = false;
  otpMode = null;
  dismissOtpNotification();
  stopResendCooldown();

  ['phone'].forEach(type => {
    document.getElementById(`signup-${type}`).disabled = false;
    document.getElementById(`otp-container-${type}`).style.display = 'none';
    document.getElementById(`otp-input-${type}`).value = '';
    const btn = document.getElementById(`btn-verify-${type}`);
    if(btn) {
      btn.innerHTML = 'Verify';
      btn.classList.remove('verified');
      btn.disabled = false;
    }
  });
}

async function handleSignUp(e) {
  e.preventDefault();
  const firstName = document.getElementById('signup-firstname').value.trim();
  const lastName = document.getElementById('signup-lastname').value.trim();
  const email = document.getElementById('signup-email').value.trim().toLowerCase();
  const phone = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value;
  const role = document.getElementById('signup-role').value;
  const terms = document.getElementById('signup-terms').checked;
  const captchaInput = document.getElementById('signup-captcha').value.trim();

  // 1. Mandatory Fields
  if (!firstName) {
    showAnimatedError('First name is mandatory. Please enter your first name.');
    return;
  }
  if (!lastName) {
    showAnimatedError('Last name is mandatory. Please enter your last name.');
    return;
  }
  if (!email) {
    showAnimatedError('Email address is mandatory. Please enter a valid email.');
    return;
  }
  if (!phone) {
    showAnimatedError('Phone number is mandatory. Please enter your phone number.');
    return;
  }
  if (!password) {
    showAnimatedError('Password is mandatory. Please create a strong password.');
    return;
  }
  if (!role) {
    showAnimatedError('Role selection is mandatory. Please select your role.');
    return;
  }
  if (!terms) {
    showAnimatedError('You must agree to the Terms & Conditions.');
    return;
  }

  // 2. CAPTCHA Validation
  if (captchaInput.toLowerCase() !== captchaData.signup.toLowerCase()) {
    showAnimatedError('Invalid Security Code. Please try again.');
    refreshCaptcha('signup');
    document.getElementById('signup-captcha').value = '';
    return;
  }

  // 3. Email format validation (domain restriction is set in site-config.js)
  const domain = TFP_CONFIG.allowedEmailDomain;
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    showAnimatedError('Please enter a valid email address.');
    return;
  }
  if (domain && !email.endsWith('@' + domain.toLowerCase())) {
    showAnimatedError(`Please enter a valid @${domain} address.`);
    return;
  }

  // 4. Phone number validation (exactly 10 digits)
  if (!/^\d{10}$/.test(phone)) {
    showAnimatedError('Phone number must be exactly 10 digits.');
    return;
  }

  // 5. Password rules (configured in site-config.js)
  const pwError = TFP.passwordError(password);
  if (pwError) {
    showAnimatedError(pwError);
    return;
  }

  // 6. OTP Verification Check
  if (!isPhoneVerified) {
    showAnimatedError('Please verify your Phone Number before signing up.');
    return;
  }

  // Create the account on the server
  const submitBtn = document.getElementById('btn-submit-signup');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account...';
  const result = await TFP.api('/api/auth/signup', {
    method: 'POST',
    body: { firstName, lastName, email, phone, password, role }
  });
  submitBtn.disabled = false;
  submitBtn.innerHTML = 'Create Account <span class="btn-arrow">→</span>';

  if (!result.success) {
    showAnimatedError(result.message || 'Could not create your account. Please try again.');
    return;
  }

  // Auto login
  TFP.setSession(result.token, result.user, true);
  closeModal('signup');

  // Create beautiful welcome overlay
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.innerHTML = `
    <div class="welcome-content">
      <div class="wc-icon">🚀</div>
      <h2 class="wc-title">Welcome, ${TFP.esc(firstName)}!</h2>
      <p class="wc-subtitle">Launching your TruckFleet Pro Dashboard...</p>
      <div class="wc-loader"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Trigger animation
  setTimeout(() => overlay.classList.add('show'), 10);

  // Redirect after animation completes
  setTimeout(() => location.href = 'dashboard.html', 3000);
}

/* ---- Sign In ---- */
async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById('signin-email').value.trim().toLowerCase();
  const password = document.getElementById('signin-password').value;
  const captchaInput = document.getElementById('signin-captcha').value.trim();

  // Validate CAPTCHA
  if (captchaInput.toLowerCase() !== captchaData.signin.toLowerCase()) {
    showFormError('signin-error', '❌ Invalid Security Code. Please try again.');
    refreshCaptcha('signin');
    document.getElementById('signin-captcha').value = '';
    return;
  }

  const submitBtn = document.getElementById('btn-submit-signin');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';
  const result = await TFP.api('/api/auth/login', { method: 'POST', body: { email, password } });
  submitBtn.disabled = false;
  submitBtn.innerHTML = 'Sign In <span class="btn-arrow">→</span>';

  if (!result.success) {
    if (result.status === 404) showFormError('signin-error', '⚠️ Account not found. Please sign up.');
    else if (result.status === 401) showFormError('signin-error', '❌ Incorrect password.');
    else showFormError('signin-error', `❌ ${result.message || 'Could not sign in. Please try again.'}`);
    return;
  }

  // "Remember me" keeps you signed in after the browser closes
  TFP.setSession(result.token, result.user, document.getElementById('signin-remember').checked);
  closeModal('signin');

  // Create beautiful welcome overlay
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.innerHTML = `
    <div class="welcome-content">
      <div class="wc-icon">🚀</div>
      <h2 class="wc-title">Welcome back, ${TFP.esc(result.user.firstName)}!</h2>
      <p class="wc-subtitle">Loading your TruckFleet Pro Dashboard...</p>
      <div class="wc-loader"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Trigger animation
  setTimeout(() => overlay.classList.add('show'), 10);

  // Redirect after animation completes
  setTimeout(() => location.href = 'dashboard.html', 3000);
}

/* ---- Smooth scroll for nav links ---- */
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navActions.classList.remove('open');
    hamburger.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
  });
});
