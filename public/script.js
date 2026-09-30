/* ================================================
   TRUCKFLEET PRO — script.js  v3.0 (Firebase)
   Landing page: theme, cursor, animations, Google sign-in
   ================================================ */

/* ---- Redirect if already logged in ---- */
FS.waitForUser().then((user) => {
  if (user) window.location.href = 'dashboard.html';
});

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

/* ---- Modal logic ---- */
function openModal(type) {
  const m = document.getElementById(`modal-${type}`);
  if (!m) return;
  if (type === 'signup') resetSignupOtpState();
  m.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal(type) {
  const m = document.getElementById(`modal-${type}`);
  if (!m) return;
  m.classList.remove('active');
  document.body.style.overflow = '';
  if (type === 'signup') resetSignupOtpState();
}
function closeModalOnOverlay(e, type) { if (e.target === e.currentTarget) closeModal(type); }
function switchModal(toType) {
  const from = toType === 'signup' ? 'signin' : 'signup';
  closeModal(from);
  setTimeout(() => openModal(toType), 200);
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

  setTimeout(() => {
    overlay.classList.add('show');
    const icon = overlay.querySelector('.cb-icon');
    if (icon) {
      icon.style.animation = 'none';
      void icon.offsetWidth;
      icon.style.animation = 'shakeError 0.5s ease-out forwards';
    }
  }, 10);
};

window.closeCustomError = function() {
  const overlay = document.getElementById('custom-error-overlay');
  if (overlay) overlay.classList.remove('show');
};

/* ---- "Check your spam folder" notice — shown right after an OTP email
   is sent, since a first-time automated email very often lands in Spam
   and a silent toast is too easy to miss. ---- */
window.showSpamNotice = function(email) {
  let overlay = document.getElementById('otp-spam-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.id = 'otp-spam-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <div class="cb-icon" style="font-size: 3.5rem;">📬</div>
        <h3 class="cb-title">Check Your Inbox</h3>
        <p class="cb-message" id="otp-spam-message"></p>
        <div class="cb-actions">
          <button class="cb-btn cb-btn-cancel" onclick="closeSpamNotice()">Got it</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  document.getElementById('otp-spam-message').textContent =
    `We've sent a 6-digit code to ${email}. If it doesn't show up in your Inbox within a minute, please check your Spam/Junk folder too.`;

  setTimeout(() => overlay.classList.add('show'), 10);
};

window.closeSpamNotice = function() {
  const overlay = document.getElementById('otp-spam-overlay');
  if (overlay) overlay.classList.remove('show');
};

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  ['signin', 'signup'].forEach(t => {
    const m = document.getElementById(`modal-${t}`);
    if (m && m.classList.contains('active')) closeModal(t);
  });
  closeCustomError();
  closeSpamNotice();
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
  setTimeout(() => el.classList.remove('show'), 4500);
}

/* Turns a Firebase Auth error code into something a user can actually act on */
function friendlyAuthError(err) {
  const map = {
    'auth/email-already-in-use': 'An account with that email already exists. Try signing in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/user-not-found': 'No account found with that email. Please sign up.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/popup-closed-by-user': '',
    'auth/cancelled-popup-request': ''
  };
  return map[err.code] !== undefined ? map[err.code] : (err.message || 'Something went wrong. Please try again.');
}

function showWelcomeOverlay(firstName, redirect = true) {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.innerHTML = `
    <div class="welcome-content">
      <div class="wc-icon">🚀</div>
      <h2 class="wc-title">Welcome, ${TFP.esc(firstName)}!</h2>
      <p class="wc-subtitle">Launching your TruckFleet Pro Dashboard...</p>
      <div class="wc-splitflap" id="wc-splitflap"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);

  if (window.createSplitFlap) {
    createSplitFlap(document.getElementById('wc-splitflap'), {
      words: ["LAUNCH READY", "SYNC ONLINE", "SIGNAL LIVE"],
      flipDuration: 0.12,
      stagger: 0.06,
      cycleDelay: 2400,
      charset: "alphanumeric",
      flipsPerChar: 8,
      tileColor: "#111827",
      textColor: "#f8fafc",
      tileRadius: 8,
      gap: 6,
      fontSize: 52,
      loop: true,
      padTo: 12
    });
  }

  if (redirect) setTimeout(() => location.href = 'dashboard.html', 2200);
}

/* ---- Sign-up "I am a..." role picker ---- */
function selectSignupRole(role) {
  document.getElementById('signup-role').value = role;
  document.querySelectorAll('.role-select-btn').forEach(btn => btn.classList.remove('selected'));
  const activeBtn = document.getElementById(`signup-role-${role}`);
  if (activeBtn) activeBtn.classList.add('selected');
}

/* ---- Google Sign-In (used by both the Sign In and Sign Up modals) ---- */
async function continueWithGoogle() {
  const openType = ['signin', 'signup'].find(t => document.getElementById(`modal-${t}`)?.classList.contains('active'));
  const btn = document.getElementById(openType === 'signup' ? 'btn-google-signup' : 'btn-google-signin');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

  // Only the Sign Up modal has a role picker — a returning user signing in
  // via Google keeps whatever role they already have.
  const role = openType === 'signup' ? document.getElementById('signup-role').value : undefined;

  try {
    const user = await FS.signInWithGoogle(role);
    if (openType) closeModal(openType);
    showWelcomeOverlay((user.displayName || 'there').split(' ')[0]);
  } catch (err) {
    const msg = friendlyAuthError(err);
    if (msg) showAnimatedError(msg);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="google-icon">G</span> Continue with Google'; }
  }
}

/* ---- Sign Up (email/password) — gated behind email OTP verification ----
   Flow: fill the form → "Send OTP" (validates just name+email, emails a
   6-digit code via EmailJS) → enter the code → "Verify OTP & Sign Up"
   (validates the rest of the form, checks the code, then actually creates
   the account). The account is never created unless the code matches. */
let signupOtp = null;
let signupOtpEmail = null;
let signupOtpResendInterval = null;

function validateOtpPrereqs() {
  const firstName = document.getElementById('signup-firstname').value.trim();
  const email = document.getElementById('signup-email').value.trim().toLowerCase();
  if (!firstName) { showAnimatedError('Please enter your first name first.'); return null; }
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) { showAnimatedError('Please enter a valid email address.'); return null; }
  return { firstName, email };
}

function validateFullSignupForm() {
  const firstName = document.getElementById('signup-firstname').value.trim();
  const lastName = document.getElementById('signup-lastname').value.trim();
  const email = document.getElementById('signup-email').value.trim().toLowerCase();
  const password = document.getElementById('signup-password').value;
  const role = document.getElementById('signup-role').value;
  const terms = document.getElementById('signup-terms').checked;

  if (!firstName) { showAnimatedError('First name is mandatory. Please enter your first name.'); return null; }
  if (!lastName) { showAnimatedError('Last name is mandatory. Please enter your last name.'); return null; }
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) { showAnimatedError('Please enter a valid email address.'); return null; }
  if (password.length < 8) { showAnimatedError('Password must be at least 8 characters long.'); return null; }
  if (!terms) { showAnimatedError('You must agree to the Terms & Conditions.'); return null; }

  return { firstName, lastName, email, password, role };
}

/* Enter key inside the form routes to whichever step is currently active —
   both buttons are type="button" (clicking them never double-fires via a
   submit event), so this is the only path a keyboard Enter takes. */
function handleSignupFormSubmit(e) {
  e.preventDefault();
  const otpSection = document.getElementById('otp-section');
  if (otpSection.style.display === 'block') {
    handleVerifyOtpAndSignUp(e);
  } else {
    handleSendOtp(e);
  }
}

async function handleSendOtp(e) {
  if (e) e.preventDefault();
  const fields = validateOtpPrereqs();
  if (!fields) return;

  const sendBtn = document.getElementById('btn-send-otp');
  const resendBtn = document.getElementById('otp-resend-btn');
  const isResend = e && e.currentTarget && e.currentTarget.id === 'otp-resend-btn';

  if (sendBtn) { sendBtn.disabled = true; if (!isResend) sendBtn.textContent = 'Sending...'; }
  if (resendBtn) resendBtn.disabled = true;

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    await emailjs.send(TFP_CONFIG.emailOtp.serviceId, TFP_CONFIG.emailOtp.templateId, {
      to_email: fields.email,
      to_name: fields.firstName,
      otp_code: otp
    });
  } catch (err) {
    showAnimatedError('Could not send the OTP email. Please check your connection and try again.');
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send OTP'; }
    if (!isResend) return;
    // A failed resend still leaves the OTP section open with the previous
    // code intact — just let them try the resend button again immediately.
    startOtpResendCooldown(0);
    return;
  }

  signupOtp = otp;
  signupOtpEmail = fields.email;

  if (sendBtn) { sendBtn.style.display = 'none'; }
  document.getElementById('otp-section').style.display = 'block';
  const otpInput = document.getElementById('otp-input');
  otpInput.value = '';
  otpInput.focus();
  showToast(`OTP sent to ${fields.email}`, 'success');
  showSpamNotice(fields.email);
  startOtpResendCooldown(60);
}

function startOtpResendCooldown(seconds) {
  const resendBtn = document.getElementById('otp-resend-btn');
  const label = document.getElementById('otp-resend-label');
  if (signupOtpResendInterval) { clearInterval(signupOtpResendInterval); signupOtpResendInterval = null; }

  let remaining = seconds;
  resendBtn.disabled = remaining > 0;
  label.textContent = remaining > 0 ? `Resend OTP in ${remaining}s` : 'Resend OTP';
  if (remaining <= 0) return;

  signupOtpResendInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(signupOtpResendInterval);
      signupOtpResendInterval = null;
      resendBtn.disabled = false;
      label.textContent = 'Resend OTP';
    } else {
      label.textContent = `Resend OTP in ${remaining}s`;
    }
  }, 1000);
}

async function handleVerifyOtpAndSignUp(e) {
  if (e) e.preventDefault();
  const fields = validateFullSignupForm();
  if (!fields) return;

  if (!signupOtp || fields.email !== signupOtpEmail) {
    showAnimatedError('Your email changed since the OTP was sent — click "Resend OTP" to get a new code for this address.');
    return;
  }

  const entered = document.getElementById('otp-input').value.trim();
  if (!/^\d{6}$/.test(entered)) { showAnimatedError('Please enter the 6-digit OTP sent to your email.'); return; }
  if (entered !== signupOtp) { showAnimatedError('Incorrect OTP. Please check your email and try again.'); return; }

  const verifyBtn = document.getElementById('btn-verify-otp');
  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Creating account...';

  try {
    await FS.signUpWithEmail(fields);
    resetSignupOtpState();
    closeModal('signup');
    showWelcomeOverlay(fields.firstName);
  } catch (err) {
    const msg = friendlyAuthError(err);
    if (msg) showAnimatedError(msg);
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify OTP & Sign Up';
  }
}

/* Wipes all in-progress OTP state — called whenever the Sign Up modal opens
   or closes so a half-finished attempt never leaks into the next one. */
function resetSignupOtpState() {
  signupOtp = null;
  signupOtpEmail = null;
  if (signupOtpResendInterval) { clearInterval(signupOtpResendInterval); signupOtpResendInterval = null; }

  const sendBtn = document.getElementById('btn-send-otp');
  const otpSection = document.getElementById('otp-section');
  const otpInput = document.getElementById('otp-input');
  if (sendBtn) { sendBtn.style.display = ''; sendBtn.disabled = false; sendBtn.textContent = 'Send OTP'; }
  if (otpSection) otpSection.style.display = 'none';
  if (otpInput) otpInput.value = '';
  closeSpamNotice();
}

/* ---- Sign In (email/password) ---- */
async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById('signin-email').value.trim().toLowerCase();
  const password = document.getElementById('signin-password').value;
  const remember = document.getElementById('signin-remember').checked;

  if (!email || !password) { showFormError('signin-error', '⚠️ Please enter your email and password.'); return; }

  const submitBtn = document.getElementById('btn-submit-signin');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const user = await FS.signInWithEmail(email, password, remember);
    closeModal('signin');
    showWelcomeOverlay(user.firstName || (user.displayName || 'there').split(' ')[0]);
  } catch (err) {
    showFormError('signin-error', `❌ ${friendlyAuthError(err)}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Sign In <span class="btn-arrow">→</span>';
  }
}

/* ---- Forgot password ---- */
async function handleForgotPassword() {
  const email = document.getElementById('signin-email').value.trim().toLowerCase();
  if (!email) {
    showFormError('signin-error', '⚠️ Enter your email above first, then click "Forgot password?".');
    return;
  }
  try {
    await FS.sendPasswordReset(email);
    showToast(`Password reset link sent to ${email}`, 'success');
  } catch (err) {
    showFormError('signin-error', `❌ ${friendlyAuthError(err)}`);
  }
}

/* ---- Smooth scroll for nav links ---- */
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navActions.classList.remove('open');
    hamburger.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
  });
});
