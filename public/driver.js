/* ════════════════════════════════════════════
   TRUCKFLEET PRO — driver.js
   Everything specific to a "driver" role account: linking to the Fleet
   Owner who added them, seeing the one trip currently assigned to them,
   one-tap status updates, trip expenses, POD submission and vehicle-issue
   reporting. See firestore.rules for exactly what a driver account can and
   can't touch — this file never reads or writes anything outside that.
════════════════════════════════════════════ */

let activeDriverTrip = null;

/* Called instead of the normal Fleet Owner init when currentUser.role is
   "driver" — see the branch in dashboard.js's DOMContentLoaded handler. */
async function initDriverDashboard() {
  applyRoleBasedNav('driver');
  switchToDriverView();

  document.getElementById('driver-welcome-name').textContent = `Welcome, ${currentUser.firstName || 'Driver'}`;

  // Resolve / claim the link to a Fleet Owner the first time this driver
  // opens the app after being added (see FS.createDriverInvite).
  if (!currentUser.linkedOwnerUid) {
    await tryClaimDriverInvite();
  }

  if (!currentUser.linkedOwnerUid) {
    document.getElementById('driver-unlinked-email').textContent = currentUser.email || '';
    document.getElementById('driver-unlinked-state').style.display = 'block';
    document.getElementById('driver-linked-content').style.display = 'none';
    return;
  }

  document.getElementById('driver-unlinked-state').style.display = 'none';
  document.getElementById('driver-linked-content').style.display = 'block';

  renderDutyToggle();
  await loadActiveDriverTrip();
}

/* Hides the Fleet Owner nav items and shows only the one this role needs.
   Fleet Owner and Company accounts are unaffected — they keep the full nav. */
function applyRoleBasedNav(role) {
  if (role !== 'driver') return;
  ['nav-dashboard', 'nav-vehicles', 'nav-drivers', 'nav-salary', 'nav-party', 'nav-bank', 'nav-trips', 'nav-broker', 'nav-admin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('nav-driver').style.display = '';
}

function switchToDriverView() {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.left-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-driver').classList.remove('hidden');
  document.getElementById('nav-driver').classList.add('active');
}

async function tryClaimDriverInvite() {
  const email = (currentUser.email || '').trim().toLowerCase();
  if (!email) return;

  const invite = await FS.getDriverInvite(email).catch(() => null);
  if (!invite || invite.driverUid) return; // no invite waiting, or already claimed

  try {
    await FS.claimDriverInvite(email, uid);
    await FS.userDoc(uid).update({ linkedOwnerUid: invite.ownerUid, linkedDriverId: invite.driverId });
    currentUser.linkedOwnerUid = invite.ownerUid;
    currentUser.linkedDriverId = invite.driverId;
  } catch (err) {
    // Rules rejected the claim (already taken, tampered payload, etc.) —
    // the caller falls back to the "not linked" empty state.
  }
}

/* ── Duty toggle ── */
function renderDutyToggle() {
  const isOn = currentUser.dutyStatus === 'on';
  document.getElementById('duty-toggle').checked = isOn;
  const label = document.getElementById('duty-status-label');
  label.textContent = isOn ? 'ON' : 'OFF';
  label.classList.toggle('on', isOn);
  label.classList.toggle('off', !isOn);
}

async function toggleDutyStatus(checkbox) {
  const next = checkbox.checked ? 'on' : 'off';
  checkbox.disabled = true;
  try {
    await FS.userDoc(uid).update({ dutyStatus: next });
    currentUser.dutyStatus = next;
    showToast(`Duty status: ${next.toUpperCase()}`, 'success');
  } catch (err) {
    checkbox.checked = !checkbox.checked; // revert the optimistic toggle
    showToast(err.message || 'Could not update duty status.', 'error');
  } finally {
    checkbox.disabled = false;
    renderDutyToggle();
  }
}

/* ── Active trip ── */
function ownerTripsRef() {
  return fbDb.collection('users').doc(currentUser.linkedOwnerUid).collection('trips');
}

async function loadActiveDriverTrip() {
  const snap = await ownerTripsRef().where('assignedDriverUid', '==', uid).get();
  const trips = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));

  // "Active" = not yet marked Unloaded; if several are assigned, the most
  // recently registered one wins.
  activeDriverTrip = trips
    .filter(t => t.driverStatus !== 'Unloaded')
    .sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt))[0] || null;

  renderActiveDriverTrip();
  document.getElementById('driver-action-grid').style.display = activeDriverTrip ? 'grid' : 'none';
  document.getElementById('driver-expense-ledger').style.display = activeDriverTrip ? 'block' : 'none';
  if (activeDriverTrip) await loadDriverExpenses();
}

function renderActiveDriverTrip() {
  const card = document.getElementById('driver-active-trip-card');
  const empty = document.getElementById('driver-no-trip-state');

  if (!activeDriverTrip) {
    card.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  card.style.display = 'block';

  const t = activeDriverTrip;
  document.getElementById('driver-truck-num').textContent = t.vehicleNumber || 'Not Assigned';
  document.getElementById('pickup-loc').textContent = t.from || '—';
  document.getElementById('drop-loc').textContent = t.to || '—';
  document.getElementById('cargo-info').textContent = t.cargoInfo || 'Not specified';
  document.getElementById('party-name').textContent = t.partyName || 'Not specified';
  document.getElementById('trip-badge').textContent = t.driverStatus || 'Assigned';

  const callBtn = document.getElementById('party-phone-btn');
  if (t.partyPhone) {
    callBtn.href = `tel:${t.partyPhone}`;
    callBtn.style.display = 'inline-flex';
  } else {
    callBtn.style.display = 'none';
  }

  document.querySelectorAll('.driver-status-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === t.driverStatus);
  });
}

async function updateTripStatus(status) {
  if (!activeDriverTrip) return;
  try {
    await ownerTripsRef().doc(activeDriverTrip.id).update({
      driverStatus: status,
      driverStatusUpdatedAt: new Date().toISOString()
    });
  } catch (err) {
    showToast(err.message || 'Could not update trip status.', 'error');
    return;
  }
  activeDriverTrip.driverStatus = status;
  renderActiveDriverTrip();
  showToast(`Status updated: ${status}`, 'success');

  // Once unloaded, this trip is done for the driver view — check whether
  // another one is already waiting.
  if (status === 'Unloaded') await loadActiveDriverTrip();
}

/* ── Trip expenses (per-trip subcollection, driver can read/create only) ── */
async function loadDriverExpenses() {
  if (!activeDriverTrip) return;
  const snap = await ownerTripsRef().doc(activeDriverTrip.id).collection('expenses').orderBy('addedAt', 'desc').get();
  renderDriverExpenseLedger(snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
}

function renderDriverExpenseLedger(expenses) {
  const tbody = document.getElementById('driver-expense-list');
  if (expenses.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No expenses added for this trip yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = expenses.map(e => `
    <tr>
      <td>${new Date(e.addedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
      <td>${e.type}</td>
      <td>₹${Number(e.amount).toLocaleString('en-IN')}</td>
      <td><span class="type-badge">${e.receiptName ? '📎 Attached' : 'None'}</span></td>
    </tr>
  `).join('');
}

async function handleExpenseSubmit(e) {
  e.preventDefault();
  if (!activeDriverTrip) { showToast('No active trip to add an expense to.', 'error'); return; }

  const type = document.getElementById('exp-type').value;
  const amount = Number(document.getElementById('exp-amount').value);
  const receiptFile = document.getElementById('exp-receipt').files[0];

  if (!amount || amount <= 0) { showToast('Enter a valid amount.', 'error'); return; }

  try {
    await ownerTripsRef().doc(activeDriverTrip.id).collection('expenses').add({
      type, amount,
      // Real image upload needs Firebase Storage, which isn't set up on
      // this project yet — for now this just records that a receipt was
      // picked, not the file itself.
      receiptName: receiptFile ? receiptFile.name : null,
      addedByUid: uid,
      addedAt: new Date().toISOString()
    });
  } catch (err) {
    showToast(err.message || 'Could not save this expense.', 'error');
    return;
  }

  document.getElementById('driver-expense-form').reset();
  await loadDriverExpenses();
  showToast('Expense saved!', 'success');
}

/* ── POD upload — file is noted, not actually stored yet (needs Firebase
   Storage, a separate service that isn't enabled on this project). ── */
let selectedPODFile = null;

function previewPOD(e) {
  selectedPODFile = e.target.files[0] || null;
  document.getElementById('pod-preview-container').style.display = selectedPODFile ? 'block' : 'none';
}

async function uploadPOD() {
  if (!activeDriverTrip || !selectedPODFile) return;
  try {
    await ownerTripsRef().doc(activeDriverTrip.id).collection('podSubmissions').add({
      fileName: selectedPODFile.name,
      submittedByUid: uid,
      submittedAt: new Date().toISOString()
    });
  } catch (err) {
    showToast(err.message || 'Could not submit POD.', 'error');
    return;
  }
  showToast('POD noted for your Fleet Owner. (Actual file upload needs Firebase Storage, which isn\'t set up yet.)', 'success');
  document.getElementById('pod-preview-container').style.display = 'none';
  document.getElementById('pod-file-input').value = '';
  selectedPODFile = null;
}

/* ── Vehicle issue report ── */
async function handleIssueReport(e) {
  e.preventDefault();
  if (!activeDriverTrip) { showToast('No active trip to report an issue against.', 'error'); return; }

  const category = document.getElementById('issue-category').value;
  const description = document.getElementById('issue-desc').value.trim();
  if (!description) { showToast('Please describe the issue.', 'error'); return; }

  try {
    await ownerTripsRef().doc(activeDriverTrip.id).collection('issues').add({
      category, description,
      vehicleNumber: activeDriverTrip.vehicleNumber || '',
      reportedByUid: uid,
      reportedAt: new Date().toISOString()
    });
  } catch (err) {
    showToast(err.message || 'Could not send this report.', 'error');
    return;
  }
  document.getElementById('vehicle-issue-form').reset();
  showToast('Fleet Owner notified of the issue!', 'success');
}
