/* ════════════════════════════════════════════
   BROKERED TRIP DETAILS JS
════════════════════════════════════════════ */

let currentUser = null;
let tripData = null;

/* ── Initialization ── */
document.addEventListener('DOMContentLoaded', async () => {
  if (!TFP.isLoggedIn()) {
    location.href = 'index.html';
    return;
  }

  const me = await TFP.api('/api/auth/me');
  if (!me.success) {
    if (me.status !== 401) { TFP.clearSession(); location.href = 'index.html'; }
    return;
  }
  currentUser = me.user;

  await loadBrokeredTrip();
  initTheme();
});

/* ── Load Trip Data ── */
async function loadBrokeredTrip() {
  const urlParams = new URLSearchParams(window.location.search);
  const tripId = urlParams.get('id');

  const loading = document.getElementById('td-loading');
  const errorEl = document.getElementById('td-error');
  const content = document.getElementById('td-content');

  if (!tripId) {
    showError(loading, errorEl);
    return;
  }

  const result = await TFP.api(`/api/broker-trips/${tripId}`);
  if (!result.success) {
    showError(loading, errorEl);
    return;
  }
  tripData = result.trip;

  loading.style.display = 'none';
  content.style.display = 'flex';

  // Populate data
  document.getElementById('td-route').textContent = `${tripData.from} → ${tripData.to}`;
  document.getElementById('td-from').textContent = tripData.from;
  document.getElementById('td-to').textContent = tripData.to;

  document.getElementById('td-company').textContent = tripData.company;
  document.getElementById('td-owner').textContent = tripData.owner;
  document.getElementById('td-veh-number').textContent = tripData.vehicleNumber;

  document.getElementById('td-purchase').textContent = `₹${parseFloat(tripData.purchase).toLocaleString('en-IN')}`;
  document.getElementById('td-sell').textContent = `₹${parseFloat(tripData.sell).toLocaleString('en-IN')}`;

  const profit = parseFloat(tripData.sell) - parseFloat(tripData.purchase);
  const profitEl = document.getElementById('td-profit');
  const profitLabel = document.getElementById('td-profit-label');

  if (profit >= 0) {
    profitLabel.textContent = 'Net Profit';
    profitEl.textContent = `+ ₹${profit.toLocaleString('en-IN')}`;
    profitEl.style.color = 'var(--success)';
  } else {
    profitLabel.textContent = 'Net Loss';
    profitEl.textContent = `- ₹${Math.abs(profit).toLocaleString('en-IN')}`;
    profitEl.style.color = 'var(--danger)';
  }

  const dateObj = new Date(tripData.date);
  document.getElementById('td-registered').textContent = dateObj.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function showError(loading, error) {
  loading.style.display = 'none';
  error.style.display   = 'block';
}

/* ════════════════════════════════════════════
   THEME LOGIC
════════════════════════════════════════════ */
function initTheme() {
  const htmlEl = document.documentElement;
  // Read saved theme
  const savedTheme = localStorage.getItem('tfp_theme') || 'dark';
  htmlEl.setAttribute('data-theme', savedTheme);
  
  // Custom cursor
  const cursorDot = document.getElementById('cursor-dot');
  const cursorCircle = document.getElementById('cursor-circle');

  if (window.matchMedia("(pointer: fine)").matches) {
    document.addEventListener('mousemove', (e) => {
      if(cursorDot) {
        cursorDot.style.left = e.clientX + 'px';
        cursorDot.style.top  = e.clientY + 'px';
      }
      if(cursorCircle) {
        cursorCircle.style.left = e.clientX + 'px';
        cursorCircle.style.top  = e.clientY + 'px';
      }
    });
    
    document.querySelectorAll('button, a, input, select, .tc-main').forEach(el => {
      el.addEventListener('mouseenter', () => {
        if(cursorCircle) cursorCircle.classList.add('hover');
      });
      el.addEventListener('mouseleave', () => {
        if(cursorCircle) cursorCircle.classList.remove('hover');
      });
    });
  } else {
    if(cursorDot) cursorDot.style.display = 'none';
    if(cursorCircle) cursorCircle.style.display = 'none';
  }
}
