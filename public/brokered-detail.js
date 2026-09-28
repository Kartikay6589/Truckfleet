/* ════════════════════════════════════════════
   BROKERED TRIP DETAILS JS
════════════════════════════════════════════ */

let currentUser = null;
let tripData = null;
let uid = null;

/* ── Initialization ── */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await FS.waitForUser();
  if (!user) {
    location.href = 'index.html';
    return;
  }
  uid = user.uid;
  currentUser = Object.assign({ id: uid }, await FS.getUserProfile(uid));

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

  const trips = await FS.getAll(uid, 'brokerTrips');
  tripData = trips.find(t => t.id === tripId);
  if (!tripData) {
    showError(loading, errorEl);
    return;
  }

  loading.style.display = 'none';
  content.style.display = 'flex';

  // Populate data (into editable inputs — see liveUpdateField / liveUpdateFinancials / liveUpdateDate)
  document.getElementById('td-route').textContent = `${tripData.from} → ${tripData.to}`;
  document.getElementById('td-edit-from').value = tripData.from;
  document.getElementById('td-edit-to').value = tripData.to;
  document.getElementById('td-edit-date').value = toDateInputValue(tripData.date);

  document.getElementById('td-edit-company').value = tripData.company;
  document.getElementById('td-edit-owner').value = tripData.owner;
  document.getElementById('td-edit-veh-number').value = tripData.vehicleNumber;

  document.getElementById('td-edit-purchase').value = parseFloat(tripData.purchase) || 0;
  document.getElementById('td-edit-sell').value = parseFloat(tripData.sell) || 0;

  renderProfit();
  renderRegisteredDate();
}

function renderProfit() {
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
}

function renderRegisteredDate() {
  const dateObj = new Date(tripData.date);
  document.getElementById('td-registered').textContent = dateObj.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function showError(loading, error) {
  loading.style.display = 'none';
  error.style.display   = 'block';
}

/* ── Date helpers — see the matching comment in trip-detail.js ── */
function toDateInputValue(isoString) {
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateInputToISOString(dateStr, referenceIso) {
  const now = referenceIso ? new Date(referenceIso) : new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}

/* Waits until typing pauses before hitting the API, so every keystroke
   doesn't fire its own request. */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ── Toast (this page never had one before — reused from trip-detail.js's pattern) ── */
function showToast(msg, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.id = 'toast';
    toast.innerHTML = '<span class="toast-icon" id="toast-icon">✅</span><span class="toast-msg" id="toast-msg"></span>';
    document.body.appendChild(toast);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  document.getElementById('toast-icon').textContent = icons[type] || '✅';
  document.getElementById('toast-msg').textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ── Live edits — one field at a time, debounced to Firestore ── */
const saveField = debounce(async (tripId, field, value) => {
  try {
    await FS.update(uid, 'brokerTrips', tripId, { [field]: value });
  } catch (err) {
    showToast(err.message || 'Could not save this change.', 'error');
  }
}, 500);

function liveUpdateField(field, value) {
  if (!tripData) return;
  tripData[field] = value;
  if (field === 'from' || field === 'to') {
    document.getElementById('td-route').textContent = `${tripData.from} → ${tripData.to}`;
  }
  saveField(tripData.id, field, value);
}

const saveFinancials = debounce(async (tripId, purchase, sell) => {
  try {
    await FS.update(uid, 'brokerTrips', tripId, { purchase, sell });
  } catch (err) {
    showToast(err.message || 'Could not save these amounts.', 'error');
  }
}, 500);

function liveUpdateFinancials() {
  if (!tripData) return;
  const purchase = parseFloat(document.getElementById('td-edit-purchase').value) || 0;
  const sell = parseFloat(document.getElementById('td-edit-sell').value) || 0;
  tripData.purchase = purchase;
  tripData.sell = sell;
  renderProfit();
  saveFinancials(tripData.id, purchase, sell);
}

const saveDate = debounce(async (tripId, date) => {
  try {
    await FS.update(uid, 'brokerTrips', tripId, { date });
  } catch (err) {
    showToast(err.message || 'Could not save the deal date.', 'error');
  }
}, 500);

function liveUpdateDate() {
  if (!tripData) return;
  const dateStr = document.getElementById('td-edit-date').value;
  if (!dateStr) return;
  const date = dateInputToISOString(dateStr, tripData.date);
  tripData.date = date;
  renderRegisteredDate();
  saveDate(tripData.id, date);
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
