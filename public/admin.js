/* ════════════════════════════════════════════
   TRUCKFLEET PRO — admin.js
   Everything specific to the "admin" role account: reviewing and
   approving/denying new Fleet Owner sign-ups. See
   firestore.rules for exactly what this account can and can't touch —
   it can only ever flip approved/denied on someone else's profile, never
   read or write any of their actual fleet data.
════════════════════════════════════════════ */

/* Called instead of the normal Fleet Owner init when currentUser.role is
   "admin" — see the branch in dashboard.js's DOMContentLoaded handler. */
async function initAdminDashboard() {
  applyAdminNav();
  switchToAdminView();
  await renderPendingAccounts();
  await renderAllUsers();
}

/* Hides every Fleet Owner/driver nav item and shows only the one this
   role needs. */
function applyAdminNav() {
  ['nav-dashboard', 'nav-vehicles', 'nav-drivers', 'nav-salary', 'nav-party', 'nav-bank', 'nav-trips', 'nav-broker'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('nav-admin').style.display = '';
}

function switchToAdminView() {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.left-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-admin').classList.remove('hidden');
  document.getElementById('nav-admin').classList.add('active');
}

async function renderPendingAccounts() {
  const tbody = document.getElementById('admin-pending-tbody');
  const count = document.getElementById('atw-count');

  let pending;
  try {
    pending = await FS.getPendingAccounts();
  } catch (err) {
    showToast(err.message || 'Could not load pending accounts.', 'error');
    return;
  }

  // Oldest signup first — first come, first reviewed.
  pending.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  count.textContent = `${pending.length} account${pending.length !== 1 ? 's' : ''} pending`;

  if (pending.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No accounts waiting on approval right now.</td></tr>`;
    return;
  }

  tbody.innerHTML = pending.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${TFP.esc(u.firstName || '')} ${TFP.esc(u.lastName || '')}</strong></td>
      <td>${TFP.esc(u.email || '')}</td>
      <td><span class="type-badge">${fmtRole(u.role)}</span></td>
      <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
      <td class="td-row-actions">
        <button class="btn-submit-vehicle" style="padding:.5rem 1rem;font-size:.82rem;" onclick="approvePendingAccount('${u.id}', this)">✅ Approve</button>
        <button class="btn-danger-full" style="padding:.5rem 1rem;font-size:.82rem;width:auto;" onclick="denyPendingAccount('${u.id}', this)">🚫 Deny</button>
      </td>
    </tr>
  `).join('');
}

async function approvePendingAccount(targetUid, btn) {
  if (btn) btn.disabled = true;
  try {
    await FS.approveAccount(targetUid);
  } catch (err) {
    showToast(err.message || 'Could not approve this account.', 'error');
    if (btn) btn.disabled = false;
    return;
  }
  showToast('Account approved.', 'success');
  await renderPendingAccounts();
  await renderAllUsers();
}

async function denyPendingAccount(targetUid, btn) {
  const confirmed = await asyncConfirm('Deny this account? They will not be able to use TruckFleet Pro.');
  if (!confirmed) return;
  if (btn) btn.disabled = true;
  try {
    await FS.denyAccount(targetUid);
  } catch (err) {
    showToast(err.message || 'Could not deny this account.', 'error');
    if (btn) btn.disabled = false;
    return;
  }
  showToast('Account denied.', 'info');
  await renderPendingAccounts();
  await renderAllUsers();
}

/* Active/Pending/Denied — a driver or the admin account itself is never
   gated (see dashboard.js's boot check), so they always read Active. */
function fmtAccountStatus(u) {
  if (u.denied) return { label: 'Denied', color: 'var(--red)' };
  if (u.role === 'fleet-owner' && u.approved === false) {
    return { label: 'Pending', color: 'var(--accent)' };
  }
  return { label: 'Active', color: 'var(--green)' };
}

async function renderAllUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  const count = document.getElementById('autw-count');

  let users;
  try {
    users = await FS.getAllAccounts();
  } catch (err) {
    showToast(err.message || 'Could not load the user list.', 'error');
    return;
  }

  count.textContent = `${users.length} user${users.length !== 1 ? 's' : ''} total`;

  if (users.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No users registered yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u, i) => {
    const status = fmtAccountStatus(u);
    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${TFP.esc(u.firstName || '')} ${TFP.esc(u.lastName || '')}</strong></td>
      <td>${TFP.esc(u.email || '')}</td>
      <td><span class="type-badge">${fmtRole(u.role)}</span></td>
      <td><span class="type-badge" style="background:${status.color};color:#fff;">${status.label}</span></td>
      <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
      <td class="td-row-actions">
        <div class="row-menu">
          <button class="row-menu-btn" onclick="toggleRowMenu(this, event)" title="Actions">⋮</button>
          <div class="row-menu-dropdown">
            <button class="row-menu-item row-menu-danger" onclick="deleteUserAccount('${u.id}', '${TFP.esc(u.email || '')}')">🗑️ Delete Account</button>
          </div>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

async function deleteUserAccount(targetUid, email) {
  const confirmed = await asyncConfirm(`Permanently delete ${email}'s account and all their data? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await FS.deleteAccount(targetUid);
  } catch (err) {
    showToast(err.message || 'Could not delete this account.', 'error');
    return;
  }
  showToast('Account deleted.', 'info');
  await renderPendingAccounts();
  await renderAllUsers();
}
