/* ════════════════════════════════════════════
   TRUCKFLEET PRO — trip-detail.js
   Shows trip info + live day counter for
   unpaid balance
════════════════════════════════════════════ */

/* ── Auth guard & Global State ── */
let currentUser = null;
let currentVehicles = [];
let uid = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await FS.waitForUser();
  if (!user) {
    location.href = 'index.html';
    return;
  }
  uid = user.uid;
  currentUser = Object.assign({ id: uid }, await FS.getUserProfile(uid));
  currentVehicles = await FS.getAll(uid, 'vehicles');

  loadTrip();
});

/* ── Theme ── */
const htmlEl = document.documentElement;
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
      const icon = document.getElementById('theme-icon');
      if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }, 200);
    rippleEl.addEventListener('animationend', () => { rippleEl.className = 'theme-ripple'; }, { once: true });
    flashEl.addEventListener('animationend',  () => { flashEl.className  = 'theme-flash';  }, { once: true });
  } else {
    htmlEl.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
  }
  localStorage.setItem('tfp_theme', theme);
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

/* ── Storage helpers ── */
function getVehicles() { return currentVehicles; }

/* ════════════════════════════════════════════
   LOAD TRIP
════════════════════════════════════════════ */
let tripData = null;
let allTrips = [];      // every trip for this vehicle's owner — needed for cycle/chain logic
let counterInterval = null;

async function loadTrip() {
  const params  = new URLSearchParams(location.search);
  const tripId  = params.get('id');

  const loading = document.getElementById('td-loading');
  const error   = document.getElementById('td-error');
  const content = document.getElementById('td-content');

  if (!tripId) { showError(loading, error); return; }

  const trips = (await FS.getAll(uid, 'trips')).sort((a, b) => new Date(a.registeredAt) - new Date(b.registeredAt));
  const trip = trips.find(t => t.id === tripId);

  if (!trip) { showError(loading, error); return; }
  allTrips = trips;

  tripData = trip;
  loading.style.display = 'none';
  content.style.display = 'flex';

  // Find vehicle info
  const vehicles = getVehicles();
  const vehicle  = vehicles.find(v => v.id === trip.vehicleId);

  // Header
  const tripIndex = trips.findIndex(t => t.id === tripId) + 1;
  document.getElementById('td-trip-num').textContent = tripIndex;
  document.getElementById('td-route').textContent     = `${trip.from} → ${trip.to}`;
  document.getElementById('td-vehicle-badge').textContent = `🚛 ${trip.vehicleNumber} · ${trip.vehicleType}`;

  const cycleOrig = trip.cycleOrigin || trip.from;
  const isCycleClosed = trip.to.trim().toLowerCase() === cycleOrig.trim().toLowerCase();
  const cycleContainer = document.getElementById('td-cycle-container');
  
  const vehicleTrips = trips.filter(t => t.vehicleId === trip.vehicleId).sort((a,b) => new Date(b.registeredAt) - new Date(a.registeredAt));
  const isLatestTrip = vehicleTrips.length > 0 && vehicleTrips[0].id === trip.id;
  
  if (!isCycleClosed && isLatestTrip) {
    cycleContainer.innerHTML = `
      <div class="td-status-badge" style="background:var(--accent); color:white; border-color:var(--accent);">Ongoing Cycle (Origin: ${cycleOrig})</div>
      <button class="btn-continue-chain" onclick="continueTripChain('${trip.vehicleId}')">➕ Continue Trip from ${trip.to}</button>
    `;
  } else if (isCycleClosed) {
    cycleContainer.innerHTML = `
      <div class="td-status-badge" style="background:var(--green); color:white; border-color:var(--green);">Cycle Completed at ${cycleOrig}</div>
    `;
  } else {
    cycleContainer.innerHTML = `
      <div class="td-status-badge" style="background:var(--bg-lighter); color:var(--text-muted); border-color:var(--border);">Historical Trip</div>
    `;
  }

  // Route (editable)
  document.getElementById('td-edit-from').value = trip.from;
  document.getElementById('td-edit-to').value   = trip.to;
  document.getElementById('td-edit-date').value = toDateInputValue(trip.registeredAt);

  // Payment
  document.getElementById('td-edit-total').value = trip.originalTotal || trip.total;
  document.getElementById('td-edit-commission').value = trip.commissionAmount || 0;
  document.getElementById('td-edit-advance').value = trip.advance || 0;
  renderPaymentBreakdown(trip);

  // Vehicle info
  document.getElementById('td-veh-number').textContent = trip.vehicleNumber || '—';
  document.getElementById('td-veh-owner').textContent  = vehicle ? vehicle.ownerName : '—';
  document.getElementById('td-veh-type').textContent   = trip.vehicleType || '—';

  // Timeline — registered date
  document.getElementById('td-registered').textContent =
    new Date(trip.registeredAt).toLocaleString('en-IN', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

  // Status
  const balance = trip.balance !== undefined ? trip.balance : (trip.total - trip.advance);
  const isPaid = trip.paid || balance <= 0;
  renderPaymentStatus(isPaid, trip, balance);

  // Mark-paid button — its label/action depends on where this trip is in the
  // payment flow: never touched, expenses already recorded but balance not
  // confirmed yet, or fully settled. See the three branches below.
  const markPaidBtn = document.getElementById('btn-mark-paid');
  if (isPaid) {
    markPaidBtn.disabled = true;
    markPaidBtn.textContent = '✅ Payment Already Settled';
    markPaidBtn.onclick = null;
  } else if (trip.expensesRecorded) {
    markPaidBtn.disabled = false;
    markPaidBtn.textContent = '✅ Confirm Balance Received';
    markPaidBtn.onclick = confirmBalanceReceivedDirect;
  } else {
    markPaidBtn.disabled = false;
    markPaidBtn.textContent = '✅ Mark Payment as Received';
    markPaidBtn.onclick = markAsPaid;
  }
}

function showError(loading, error) {
  loading.style.display = 'none';
  error.style.display   = 'block';
}

/* "YYYY-MM-DDTHH:mm:ss.sssZ" -> "YYYY-MM-DD" in LOCAL time, for populating
   an <input type="date">. Using toISOString().slice(0,10) directly would
   shift the date back a day for any timezone ahead of UTC in the evening. */
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

/* Renders the TDS/GST/Net/Balance rows from a trip's stored percentages —
   shared by the initial page load and liveUpdateTotal(), since editing the
   Total Amount has to recompute all of these exactly the same way the trip
   wizard did when the trip was first created. */
function renderPaymentBreakdown(trip) {
  const originalTotal = trip.originalTotal || trip.total;
  const balance = trip.balance !== undefined ? trip.balance : (trip.total - trip.advance);

  if (trip.tdsPercent > 0) {
    document.getElementById('td-tds-row').style.display = 'flex';
    document.getElementById('td-tds-percent').textContent = `(${trip.tdsPercent}%)`;
    document.getElementById('td-tds-amount').textContent = `- ₹${trip.tdsAmount.toLocaleString('en-IN')}`;
  } else {
    document.getElementById('td-tds-row').style.display = 'none';
  }

  document.getElementById('td-igst-row').style.display = 'none';
  document.getElementById('td-cgst-row').style.display = 'none';
  document.getElementById('td-sgst-row').style.display = 'none';

  if (trip.gstType === 'IGST' && trip.gstPercent > 0) {
    document.getElementById('td-igst-row').style.display = 'flex';
    document.getElementById('td-igst-percent').textContent = `(${trip.gstPercent}%)`;
    document.getElementById('td-igst-amount').textContent = `+ ₹${trip.gstAmount.toLocaleString('en-IN')}`;
  } else if (trip.gstType === 'CSGST' && trip.gstPercent > 0) {
    const halfRate = trip.gstPercent / 2;
    const halfAmount = trip.gstAmount / 2;

    document.getElementById('td-cgst-row').style.display = 'flex';
    document.getElementById('td-cgst-percent').textContent = `(${halfRate}%)`;
    document.getElementById('td-cgst-amount').textContent = `+ ₹${halfAmount.toLocaleString('en-IN')}`;

    document.getElementById('td-sgst-row').style.display = 'flex';
    document.getElementById('td-sgst-percent').textContent = `(${halfRate}%)`;
    document.getElementById('td-sgst-amount').textContent = `+ ₹${halfAmount.toLocaleString('en-IN')}`;
  }

  const hasTdsOrGst = trip.tdsPercent > 0 || (trip.gstType && trip.gstType !== 'NILL');
  document.getElementById('td-net-row').style.display = hasTdsOrGst ? 'flex' : 'none';
  document.getElementById('td-net-total').textContent = `₹${trip.total.toLocaleString('en-IN')}`;

  const balEl = document.getElementById('td-balance');
  balEl.textContent = `₹${Math.abs(balance).toLocaleString('en-IN')}`;
  balEl.className   = `td-pay-value td-balance ${trip.paid || balance <= 0 ? 'settled' : 'pending'}`;
}

/* ── Payment Status & Day Counter ── */
function renderPaymentStatus(isPaid, trip, balance) {
  const alert      = document.getElementById('td-alert');
  const paidBanner = document.getElementById('td-paid-banner');
  const statusBadge     = document.getElementById('td-status-badge');
  const tlPaidItem      = document.getElementById('tl-paid-item');
  const tlPendingItem   = document.getElementById('tl-pending-item');
  const paidDateEl      = document.getElementById('td-paid-date');

  if (isPaid) {
    // Settled
    paidBanner.style.display = 'flex';
    alert.style.display      = 'none';
    statusBadge.textContent  = '✅ Settled';
    statusBadge.classList.add('settled');
    tlPendingItem.style.display = 'none';

    if (trip.paidAt) {
      tlPaidItem.style.display = 'flex';
      paidDateEl.textContent   = new Date(trip.paidAt).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
    }
  } else {
    // Pending
    alert.style.display      = 'flex';
    paidBanner.style.display = 'none';
    statusBadge.textContent  = '⏳ Payment Pending';
    tlPendingItem.style.display = 'flex';

    // Start live counter
    startDayCounter(trip.registeredAt);
  }

  // Expenses were recorded either when the trip was actually settled, or
  // earlier via "No, Not Received Yet" — either way, show what was already
  // entered instead of hiding it until the balance is confirmed received.
  if (isPaid || trip.expensesRecorded) {
    renderExpensesCard(trip);
  }
}

function renderExpensesCard(trip) {
  document.getElementById('td-card-expenses').style.display = 'block';

  const fuel = trip.fuelExpense || 0;
  const toll = trip.tollExpense || 0;
  const driver = trip.driverExpense || 0;
  const totalExp = fuel + toll + driver;
  const profit = trip.total - totalExp;

  document.getElementById('td-edit-fuel').value = fuel;
  document.getElementById('td-edit-toll').value = toll;
  document.getElementById('td-edit-driver').value = driver;
  document.getElementById('td-exp-total').textContent = `₹${totalExp.toLocaleString('en-IN')}`;

  const profitEl = document.getElementById('td-exp-profit');
  const profitLabel = document.getElementById('td-exp-profit-label');
  if (profit >= 0) {
    if (profitLabel) profitLabel.textContent = 'Net Profit';
    profitEl.textContent = `+ ₹${profit.toLocaleString('en-IN')}`;
    profitEl.style.color = 'var(--success)';
  } else {
    if (profitLabel) profitLabel.textContent = 'Net Loss';
    profitEl.textContent = `- ₹${Math.abs(profit).toLocaleString('en-IN')}`;
    profitEl.style.color = 'var(--danger)';
  }
}

/* ── Live Day Counter (updates every second, ticks at 24h boundaries) ── */
function startDayCounter(registeredAt) {
  const refTime = new Date(registeredAt).getTime();

  function update() {
    const now     = Date.now();
    const elapsed = now - refTime;

    const totalSeconds  = Math.floor(elapsed / 1000);
    const days          = Math.floor(elapsed / 86400000);       // full days
    const remainingMs   = elapsed % 86400000;
    const remainingH    = Math.floor(remainingMs / 3600000);
    const remainingM    = Math.floor((remainingMs % 3600000) / 60000);
    const remainingS    = Math.floor((remainingMs % 60000) / 1000);

    // Big counter number
    document.getElementById('td-day-counter').textContent = days;

    // Alert text
    const alertDays = document.getElementById('td-alert-days');
    if (days === 0) {
      alertDays.textContent = `${remainingH}h ${remainingM}m ${remainingS}s`;
    } else if (days === 1) {
      alertDays.textContent = `1 day, ${remainingH}h ${remainingM}m`;
    } else {
      alertDays.textContent = `${days} days, ${remainingH}h ${remainingM}m`;
    }

    // Pending since in timeline
    const pendingSince = document.getElementById('td-pending-since');
    if (days === 0) {
      pendingSince.textContent = `Less than 1 day (${remainingH}h ${remainingM}m ${remainingS}s elapsed)`;
    } else {
      pendingSince.textContent = `${days} day${days !== 1 ? 's' : ''} elapsed — ${remainingH}h ${remainingM}m remaining today`;
    }
  }

  update();
  counterInterval = setInterval(update, 1000);
}

/* ════════════════════════════════════════════
   MARK AS PAID
════════════════════════════════════════════ */
function markAsPaid() {
  if (!tripData) return;

  // Reset inputs
  document.getElementById('exp-fuel').value = 0;
  document.getElementById('exp-toll').value = 0;
  document.getElementById('exp-driver').value = 0;

  // Show Step 1
  document.getElementById('expense-step-1').style.display = 'block';
  document.getElementById('expense-step-2').style.display = 'none';
  document.getElementById('expense-step-3').style.display = 'none';
  document.getElementById('expense-step-4').style.display = 'none';

  document.getElementById('modal-expense-wizard').classList.add('active');
}

function nextExpenseStep(step) {
  // Hide all
  for (let i=1; i<=4; i++) document.getElementById(`expense-step-${i}`).style.display = 'none';
  
  if (step === 4) {
    const fuel = parseFloat(document.getElementById('exp-fuel').value) || 0;
    const toll = parseFloat(document.getElementById('exp-toll').value) || 0;
    const driver = parseFloat(document.getElementById('exp-driver').value) || 0;
    const totalExp = fuel + toll + driver;
    const balance = tripData.balance !== undefined ? tripData.balance : (tripData.total - tripData.advance);
    const profit = tripData.total - totalExp;

    const summary = document.getElementById('pay-confirm-summary');
    summary.innerHTML = `
      <div class="pcs-row"><span class="pcs-label">Route</span><span class="pcs-value">${tripData.from} → ${tripData.to}</span></div>
      <div class="pcs-divider"></div>
      <div class="pcs-row"><span class="pcs-label">Total Amount</span><span class="pcs-value">₹${tripData.total.toLocaleString('en-IN')}</span></div>
      <div class="pcs-row pcs-row-highlight"><span class="pcs-label">Balance Remaining</span><span class="pcs-value">₹${balance.toLocaleString('en-IN')}</span></div>
      <div class="pcs-divider"></div>
      <div class="pcs-row"><span class="pcs-label">Total Expenses</span><span class="pcs-value" style="color:var(--danger)">₹${totalExp.toLocaleString('en-IN')}</span></div>
      <div class="pcs-row"><span class="pcs-label">${profit >= 0 ? 'Estimated Profit' : 'Estimated Loss'}</span><span class="pcs-value" style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${profit >= 0 ? '+' : '-'} ₹${Math.abs(profit).toLocaleString('en-IN')}</span></div>
    `;

    // No balance left to confirm receiving (advance already covered it) —
    // asking "did you receive the balance?" would make no sense here.
    const hasBalance = balance > 0;
    document.getElementById('balance-confirm-group').style.display = hasBalance ? 'block' : 'none';
    document.getElementById('already-settled-group').style.display = hasBalance ? 'none' : 'flex';
  }

  document.getElementById(`expense-step-${step}`).style.display = 'block';
}

function prevExpenseStep(step) {
  for (let i=1; i<=4; i++) document.getElementById(`expense-step-${i}`).style.display = 'none';
  document.getElementById(`expense-step-${step}`).style.display = 'block';
}

function closeSubModal(id) {
  document.getElementById(`modal-${id}`).classList.remove('active');
}

function closeSubModalOnOverlay(e, id) {
  if (e.target.id === `modal-${id}`) closeSubModal(id);
}

/* receivedBalance: true when the user explicitly confirmed the Balance
   Remaining was actually received (or there was no balance left to
   confirm) — false means they said "not received yet", so expenses are
   saved but the trip stays pending instead of silently being marked paid. */
async function executePaidConfirm(receivedBalance) {
  if (!tripData) return;

  const fuel = parseFloat(document.getElementById('exp-fuel').value) || 0;
  const toll = parseFloat(document.getElementById('exp-toll').value) || 0;
  const driver = parseFloat(document.getElementById('exp-driver').value) || 0;

  const updates = receivedBalance
    ? { paid: true, paidAt: new Date().toISOString(), balance: 0, fuelExpense: fuel, tollExpense: toll, driverExpense: driver }
    : { fuelExpense: fuel, tollExpense: toll, driverExpense: driver, expensesRecorded: true };

  try {
    await FS.update(uid, 'trips', tripData.id, updates);
  } catch (err) {
    showToast(err.message || 'Could not save this payment.', 'error');
    return;
  }
  Object.assign(tripData, updates);

  closeSubModal('expense-wizard');
  if (receivedBalance) {
    if (counterInterval) clearInterval(counterInterval);
    showToast('✅ Payment and expenses saved!', 'success');
  } else {
    showToast('Expenses saved. Balance is still marked as pending.', 'info');
  }
  setTimeout(() => location.reload(), 1000);
}

/* ── Simple Yes/No confirm dialog (reuses the same overlay dashboard.js
   uses for delete confirmations) ── */
function asyncConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-confirm-overlay');
    const msgEl = document.getElementById('custom-confirm-message');
    const btnCancel = document.getElementById('custom-confirm-cancel');
    const btnOk = document.getElementById('custom-confirm-ok');

    msgEl.textContent = message;
    overlay.classList.add('show');

    function cleanup() {
      overlay.classList.remove('show');
      btnCancel.removeEventListener('click', onCancel);
      btnOk.removeEventListener('click', onOk);
    }
    function onCancel() { cleanup(); resolve(false); }
    function onOk() { cleanup(); resolve(true); }

    btnCancel.addEventListener('click', onCancel);
    btnOk.addEventListener('click', onOk);
  });
}

/* Shown instead of the full 4-step wizard once expenses have already been
   recorded (via "No, Not Received Yet") — no need to re-enter them, just
   confirm the balance actually came in now. Reads the live expense inputs
   since those are auto-saved as the user edits them (see
   liveUpdateExpenses), so whatever's on screen is what gets locked in. */
async function confirmBalanceReceivedDirect() {
  if (!tripData) return;

  const balance = tripData.total - tripData.advance;
  const confirmed = await asyncConfirm(`Have you received the Balance Remaining of ₹${balance.toLocaleString('en-IN')}?`);
  if (!confirmed) return;

  const fuel = parseFloat(document.getElementById('td-edit-fuel').value) || 0;
  const toll = parseFloat(document.getElementById('td-edit-toll').value) || 0;
  const driver = parseFloat(document.getElementById('td-edit-driver').value) || 0;

  const updates = { paid: true, paidAt: new Date().toISOString(), balance: 0, fuelExpense: fuel, tollExpense: toll, driverExpense: driver };
  try {
    await FS.update(uid, 'trips', tripData.id, updates);
  } catch (err) {
    showToast(err.message || 'Could not save this payment.', 'error');
    return;
  }
  Object.assign(tripData, updates);

  if (counterInterval) clearInterval(counterInterval);
  showToast('✅ Payment marked as received!', 'success');
  setTimeout(() => location.reload(), 1000);
}

/* ── Toast ── */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  document.getElementById('toast-icon').textContent = icons[type] || '✅';
  document.getElementById('toast-msg').textContent  = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

/* Waits until typing pauses before hitting the API, so every keystroke
   doesn't fire its own request. */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const saveAdvance = debounce(async (tripId, advance) => {
  try {
    await FS.update(uid, 'trips', tripId, { advance, balance: tripData.total - advance });
  } catch (err) {
    showToast(err.message || 'Could not save the advance amount.', 'error');
  }
}, 500);

/* ── Live Update Advance ── */
function liveUpdateAdvance() {
  if (!tripData) return;

  const advance = parseFloat(document.getElementById('td-edit-advance').value) || 0;

  tripData.advance = advance;
  tripData.balance = tripData.total - advance;

  const balEl = document.getElementById('td-balance');
  balEl.textContent = `₹${Math.abs(tripData.balance).toLocaleString('en-IN')}`;

  if (tripData.balance < 0) {
    balEl.textContent = `- ` + balEl.textContent;
    balEl.style.color = 'var(--danger)';
  } else if (tripData.balance === 0) {
    balEl.style.color = 'var(--success)';
  } else {
    balEl.style.color = 'var(--heading)';
  }

  saveAdvance(tripData.id, advance);
}

/* ── Live Update Route (From / To) ── */
const saveRoute = debounce(async (tripId, from, to) => {
  try {
    await FS.update(uid, 'trips', tripId, { from, to });
  } catch (err) {
    showToast(err.message || 'Could not save the route.', 'error');
  }
}, 500);

function liveUpdateRoute() {
  if (!tripData) return;
  const from = document.getElementById('td-edit-from').value.trim();
  const to = document.getElementById('td-edit-to').value.trim();
  tripData.from = from;
  tripData.to = to;
  document.getElementById('td-route').textContent = `${from} → ${to}`;
  saveRoute(tripData.id, from, to);
}

/* ── Live Update Trip Date ── */
const saveDate = debounce(async (tripId, registeredAt) => {
  try {
    await FS.update(uid, 'trips', tripId, { registeredAt });
  } catch (err) {
    showToast(err.message || 'Could not save the trip date.', 'error');
  }
}, 500);

function liveUpdateDate() {
  if (!tripData) return;
  const dateStr = document.getElementById('td-edit-date').value;
  if (!dateStr) return;
  const registeredAt = dateInputToISOString(dateStr, tripData.registeredAt);
  tripData.registeredAt = registeredAt;
  document.getElementById('td-registered').textContent =
    new Date(registeredAt).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  saveDate(tripData.id, registeredAt);
}

/* ── Live Update Total Amount (recomputes TDS/GST/Net/Balance from the
   trip's existing percentages, exactly like the trip wizard did) ── */
const saveTotal = debounce(async (tripId, fields) => {
  try {
    await FS.update(uid, 'trips', tripId, fields);
  } catch (err) {
    showToast(err.message || 'Could not save the total amount.', 'error');
  }
}, 500);

function liveUpdateTotal() {
  if (!tripData) return;
  const originalTotal = parseFloat(document.getElementById('td-edit-total').value) || 0;

  const tdsAmount = Math.round((originalTotal * (tripData.tdsPercent || 0)) / 100);
  const gstAmount = Math.round((originalTotal * (tripData.gstPercent || 0)) / 100);
  const commissionAmount = tripData.commissionAmount || 0;
  const netTotal = originalTotal - tdsAmount + gstAmount - commissionAmount;

  tripData.originalTotal = originalTotal;
  tripData.tdsAmount = tdsAmount;
  tripData.gstAmount = gstAmount;
  tripData.total = netTotal;
  tripData.balance = netTotal - tripData.advance;

  renderPaymentBreakdown(tripData);
  saveTotal(tripData.id, { originalTotal, tdsAmount, gstAmount, total: netTotal, balance: tripData.balance });
}

/* ── Live Update Commission ── */
const saveCommission = debounce(async (tripId, commissionAmount, total, balance) => {
  try {
    await FS.update(uid, 'trips', tripId, { commissionAmount, total, balance });
  } catch (err) {
    showToast(err.message || 'Could not save the commission amount.', 'error');
  }
}, 500);

function liveUpdateCommission() {
  if (!tripData) return;
  const commissionAmount = parseFloat(document.getElementById('td-edit-commission').value) || 0;
  const originalTotal = tripData.originalTotal || tripData.total;
  const tdsAmount = tripData.tdsAmount || 0;
  const gstAmount = tripData.gstAmount || 0;
  const netTotal = originalTotal - tdsAmount + gstAmount - commissionAmount;

  tripData.commissionAmount = commissionAmount;
  tripData.total = netTotal;
  tripData.balance = netTotal - tripData.advance;

  renderPaymentBreakdown(tripData);
  saveCommission(tripData.id, commissionAmount, netTotal, tripData.balance);
}

const saveExpenses = debounce(async (tripId, fuelExpense, tollExpense, driverExpense) => {
  try {
    await FS.update(uid, 'trips', tripId, { fuelExpense, tollExpense, driverExpense });
  } catch (err) {
    showToast(err.message || 'Could not save these expenses.', 'error');
  }
}, 500);

/* ── Live Update Expenses ── */
function liveUpdateExpenses() {
  if (!tripData) return;

  const fuel = parseFloat(document.getElementById('td-edit-fuel').value) || 0;
  const toll = parseFloat(document.getElementById('td-edit-toll').value) || 0;
  const driver = parseFloat(document.getElementById('td-edit-driver').value) || 0;

  const totalExp = fuel + toll + driver;
  const profit = tripData.total - totalExp;

  document.getElementById('td-exp-total').textContent = `₹${totalExp.toLocaleString('en-IN')}`;

  const profitEl = document.getElementById('td-exp-profit');
  const profitLabel = document.getElementById('td-exp-profit-label');
  if (profit >= 0) {
    if(profitLabel) profitLabel.textContent = 'Net Profit';
    profitEl.textContent = `+ ₹${profit.toLocaleString('en-IN')}`;
    profitEl.style.color = 'var(--success)';
  } else {
    if(profitLabel) profitLabel.textContent = 'Net Loss';
    profitEl.textContent = `- ₹${Math.abs(profit).toLocaleString('en-IN')}`;
    profitEl.style.color = 'var(--danger)';
  }

  tripData.fuelExpense = fuel;
  tripData.tollExpense = toll;
  tripData.driverExpense = driver;

  saveExpenses(tripData.id, fuel, toll, driver);
}

window.continueTripChain = function(vid) {
  localStorage.setItem('tfp_continue_vehicle', vid);
  location.href = 'dashboard.html#trips';
};
