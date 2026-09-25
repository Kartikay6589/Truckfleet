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
  document.getElementById(`modal-${type}`).classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal(type) {
  document.getElementById(`modal-${type}`).classList.remove('active');
  document.body.style.overflow = '';
}
function closeModalOnOverlay(e, type) { if (e.target === e.currentTarget) closeModal(type); }

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
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const authModal = document.getElementById('modal-auth');
  if (authModal && authModal.classList.contains('active')) closeModal('auth');
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

/* ---- Google Sign-In ---- */
async function continueWithGoogle() {
  const btn = document.getElementById('btn-google-signin');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

  try {
    const user = await FS.signInWithGoogle();
    closeModal('auth');

    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.innerHTML = `
      <div class="welcome-content">
        <div class="wc-icon">🚀</div>
        <h2 class="wc-title">Welcome, ${TFP.esc((user.displayName || 'there').split(' ')[0])}!</h2>
        <p class="wc-subtitle">Launching your TruckFleet Pro Dashboard...</p>
        <div class="wc-loader"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 10);
    setTimeout(() => location.href = 'dashboard.html', 2000);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      showAnimatedError(err.message || 'Could not sign in with Google. Please try again.');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="google-icon">G</span> Continue with Google'; }
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
