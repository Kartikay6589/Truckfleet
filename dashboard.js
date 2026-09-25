/* ════════════════════════════════════════════
   TRUCKFLEET PRO — dashboard.js  v3.0
   ════════════════════════════════════════════ */

/* ── Auth guard & Global State ── */
let currentUser = null;
let currentVehicles = [];
let currentTrips = [];
let currentBrokerTrips = [];
let currentNotifications = [];
let currentDrivers = [];

// All real data now lives on the server (backend/db.js), scoped to the
// signed-in account by its login token — see site-config.js's TFP.api().
document.addEventListener('DOMContentLoaded', async () => {
  if (!TFP.isLoggedIn()) {
    location.href = 'index.html';
    return;
  }

  const me = await TFP.api('/api/auth/me');
  if (!me.success) {
    // TFP.api() already cleared the session and redirected on a real 401;
    // this covers the "server unreachable" case too.
    if (me.status !== 401) {
      TFP.clearSession();
      location.href = 'index.html';
    }
    return;
  }
  currentUser = me.user;

  const [vehiclesRes, driversRes, tripsRes, brokerRes, notifsRes] = await Promise.all([
    TFP.api('/api/vehicles'),
    TFP.api('/api/drivers'),
    TFP.api('/api/trips'),
    TFP.api('/api/broker-trips'),
    TFP.api('/api/notifications')
  ]);
  currentVehicles = vehiclesRes.vehicles || [];
  currentDrivers = driversRes.drivers || [];
  currentTrips = tripsRes.trips || [];
  currentBrokerTrips = brokerRes.trips || [];
  currentNotifications = notifsRes.notifications || [];

  // Render everything
  renderAccountDetails();
  renderVehiclesTable();
  renderDriversTable();
  renderTripsList();
  renderBrokerList();
  renderNotifications();
  updateNotifBadge();

  // Actually initialize the dynamic names and dates
  initDashboard();
});

/* ── State helpers — currentX arrays are the local cache; every mutation
   below calls the API first and only updates the cache once it succeeds ── */
function getVehicles() { return currentVehicles; }
function getDrivers() { return currentDrivers; }
function getTrips() { return currentTrips; }
function getNotifications() { return currentNotifications; }

/* Vehicle-add/remove and driver-add/remove notifications are created
   server-side (see backend/routes/vehicles.js and drivers.js) — this just
   pulls the fresh list down so the bell badge and panel stay in sync. */
async function refreshNotifications() {
  const res = await TFP.api('/api/notifications');
  if (res.success) {
    currentNotifications = res.notifications;
    updateNotifBadge();
    renderNotifications();
  }
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  const count = currentNotifications.length;
  badge.style.display = count > 0 ? 'block' : 'none';
  badge.textContent = count > 9 ? '9+' : count;
}

/* ════════════════════════════════════════════
   CUSTOM CONFIRM MODAL
════════════════════════════════════════════ */
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

/* ── Toast ── */
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
      updateThemeIcons(theme);
    }, 200);
    rippleEl.addEventListener('animationend', () => { rippleEl.className = 'theme-ripple'; }, { once: true });
    flashEl.addEventListener('animationend',  () => { flashEl.className  = 'theme-flash';  }, { once: true });
  } else {
    htmlEl.setAttribute('data-theme', theme);
    updateThemeIcons(theme);
  }
}
function updateThemeIcons(t) {
  const icon = document.getElementById('theme-icon');
  const si   = document.getElementById('sm-theme-icon');
  const sl   = document.getElementById('sm-theme-label');
  if (icon) icon.textContent = t === 'dark' ? '🌙' : '☀️';
  if (si)   si.textContent   = t === 'dark' ? '🌙' : '☀️';
  if (sl)   sl.textContent   = t === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  localStorage.setItem('tfp_theme', t);
}
function toggleTheme() {
  const curr = htmlEl.getAttribute('data-theme') || 'dark';
  const next = curr === 'dark' ? 'light' : 'dark';
  const btn  = document.getElementById('theme-toggle');
  const rect = btn.getBoundingClientRect();
  applyTheme(next, true, rect.left + rect.width / 2, rect.top + rect.height / 2);
}
function toggleThemeFromMenu() {
  const curr = htmlEl.getAttribute('data-theme') || 'dark';
  const next = curr === 'dark' ? 'light' : 'dark';
  const btn  = document.getElementById('sm-theme-btn');
  const rect = btn.getBoundingClientRect();
  applyTheme(next, true, rect.left + rect.width / 2, rect.top + rect.height / 2);
}
applyTheme(localStorage.getItem('tfp_theme') || 'dark', false);

/* ════════════════════════════════════════════
   APPEARANCE / CUSTOMIZATION PANEL
   Reads & writes preferences via TFPPrefs (site-config.js)
════════════════════════════════════════════ */
function setPrefTheme(isDark) {
  const wanted = isDark ? 'dark' : 'light';
  if ((htmlEl.getAttribute('data-theme') || 'dark') !== wanted) toggleTheme();
  TFPPrefs.set({ theme: wanted });
}

function renderAppearanceModal() {
  const prefs = TFPPrefs.get();

  // Accent swatches
  const swatchWrap = document.getElementById('appearance-accent-swatches');
  swatchWrap.innerHTML = Object.entries(TFPPrefs.presets).map(([key, preset]) => `
    <button type="button" title="${preset.label}"
      onclick="TFPPrefs.set({accent:'${key}'}); renderAppearanceModal();"
      style="width:36px;height:36px;border-radius:50%;cursor:pointer;
        background:${preset.colors[0]};
        border:3px solid ${prefs.accent === key ? 'var(--heading)' : 'transparent'};
        box-shadow:0 0 0 1px var(--border);">
    </button>
  `).join('');

  document.getElementById('appearance-theme-toggle').checked = (htmlEl.getAttribute('data-theme') || 'dark') === 'dark';
  document.getElementById('appearance-cursor-toggle').checked = prefs.customCursor;
  document.getElementById('appearance-anim-toggle').checked = prefs.animations;

  document.querySelectorAll('#appearance-font-row button').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.scale) === Number(prefs.fontScale));
    btn.onclick = () => { TFPPrefs.set({ fontScale: Number(btn.dataset.scale) }); renderAppearanceModal(); };
  });
}

function resetAppearance() {
  TFPPrefs.reset();
  const prefs = TFPPrefs.get();
  applyTheme(prefs.theme, false);
  updateThemeIcons(prefs.theme);
  renderAppearanceModal();
  showToast('Appearance reset to defaults.', 'success');
}

/* ── Custom cursor ── */
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
  if (['BUTTON','A','INPUT','SELECT'].includes(e.target.tagName)
    || e.target.closest('.trip-card') || e.target.closest('.ov-card')
    || e.target.closest('.qa-card') || e.target.closest('.vs-option'))
    cc.classList.add('hover');
});
document.addEventListener('mouseout', () => cc.classList.remove('hover'));

/* ════════════════════════════════════════════
   DASHBOARD INIT
════════════════════════════════════════════ */
let selectedRole = '';

function selectRole(role) {
  selectedRole = role;
  document.querySelectorAll('.role-option-btn').forEach(btn => {
    btn.classList.remove('selected');
    btn.querySelector('.role-opt-check').innerHTML = '';
  });
  
  const activeBtn = document.getElementById(`role-${role}`);
  if (activeBtn) {
    activeBtn.classList.add('selected');
    activeBtn.querySelector('.role-opt-check').innerHTML = '●';
  }
}

async function saveRole() {
  if (!selectedRole) return;

  const result = await TFP.api('/api/auth/role', { method: 'PATCH', body: { role: selectedRole } });
  if (!result.success) {
    showToast(result.message || 'Could not update your role.', 'error');
    return;
  }
  currentUser = result.user;
  TFP.setUser(currentUser);

  document.getElementById('ov-role').textContent = fmtRole(selectedRole);
  document.getElementById('sidemenu-role').textContent = fmtRole(selectedRole);
  closeSubModal('change-role');
  showToast(`Role updated to ${fmtRole(selectedRole)}!`, 'success');
}

function initDashboard() {
  // User info
  const lastNameStr = currentUser.lastName ? ` ${currentUser.lastName}` : '';
  const name = `${currentUser.firstName}${lastNameStr}`;
  document.getElementById('sidemenu-name').textContent = name;
  document.getElementById('sidemenu-role').textContent = fmtRole(currentUser.role);
  document.getElementById('sidemenu-avatar').textContent = currentUser.firstName[0].toUpperCase();

  // Greeting
  const h = new Date().getHours();
  const tod = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  document.getElementById('dash-greeting').innerHTML = `${tod}, ${currentUser.firstName}! <span style="font-size:1.2em">👋</span>`;
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Stats
  document.getElementById('ov-name').textContent = name;
  document.getElementById('ov-role').textContent = fmtRole(currentUser.role);
  refreshStats();
  updateNotifBadge();

  // Check for trip chain continuation
  const continueVid = localStorage.getItem('tfp_continue_vehicle');
  if (continueVid) {
    localStorage.removeItem('tfp_continue_vehicle');
    const v = getVehicles().find(v => v.id === continueVid);
    if (v) {
      setTimeout(() => {
        switchView('trips');
        startTripWizard();
        setTimeout(() => selectVehicle(v.id, v.vehicleNumber, v.vehicleType), 250);
      }, 300);
    }
  } else if (location.hash) {
    // Navigate to specific tab based on hash
    const viewName = location.hash.substring(1);
    if (['dashboard', 'vehicles', 'drivers', 'trips', 'broker'].includes(viewName)) {
      switchView(viewName);
    }
  }
}

function refreshStats() {
  document.getElementById('ov-trucks').textContent = getVehicles().length;
  document.getElementById('ov-trips').textContent   = getTrips().length;
  document.getElementById('ov-broker').textContent  = getBrokerTrips().length;
}

function fmtRole(r) {
  return { 'fleet-owner':'Fleet Owner', 'company':'Company', 'driver':'Truck Driver' }[r] || r || 'Fleet Owner';
}

/* ════════════════════════════════════════════
   NAVIGATION / VIEW SWITCHING
════════════════════════════════════════════ */
let currentView = 'dashboard';

function switchView(view) {
  // hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  // deactivate all nav items
  document.querySelectorAll('.left-nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.getElementById(`nav-${view}`).classList.add('active');
  currentView = view;

  if (view === 'vehicles') renderVehiclesTable();
  if (view === 'drivers')  renderDriversTable();
  if (view === 'trips')    renderTripsList();
  if (view === 'broker')   renderBrokerList();
  if (view === 'dashboard') refreshStats();
}

/* ════════════════════════════════════════════
   SIDE MENU
════════════════════════════════════════════ */
function toggleSideMenu() {
  document.getElementById('sidemenu').classList.toggle('open');
  document.getElementById('sidemenu-overlay').classList.toggle('active');
}
function closeSideMenu() {
  document.getElementById('sidemenu').classList.remove('open');
  document.getElementById('sidemenu-overlay').classList.remove('active');
}

/* ════════════════════════════════════════════
   MY VEHICLES — ADD VEHICLE FORM
════════════════════════════════════════════ */
let addVehiclePanelOpen = false;

function toggleAddVehicleForm() {
  addVehiclePanelOpen = !addVehiclePanelOpen;
  const panel = document.getElementById('add-vehicle-panel');
  const btn   = document.getElementById('btn-show-add-vehicle');
  panel.style.display = addVehiclePanelOpen ? 'block' : 'none';
  btn.textContent = addVehiclePanelOpen ? '✕ Close' : '➕ Add Vehicle';
  if (addVehiclePanelOpen) {
    setTimeout(() => document.getElementById('veh-number').focus(), 100);
  }
}

function handleVehTypeChange(val) {
  const cTypeField = document.getElementById('container-type-field');
  const cSizeField = document.getElementById('container-size-field');
  if (val === 'Container Truck') {
    cTypeField.style.display = 'flex';
  } else {
    cTypeField.style.display = 'none';
    cSizeField.style.display = 'none';
    document.getElementById('veh-container-type').value = '';
    document.getElementById('veh-container-size').value = '';
    document.querySelectorAll('#container-type-field .veh-sub-btn').forEach(b => b.classList.remove('active'));
  }
}

function selectContainerType(type) {
  document.getElementById('veh-container-type').value = type;
  document.getElementById('veh-container-size').value = '';
  document.querySelectorAll('#container-type-field .veh-sub-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`veh-btn-${type}`).classList.add('active');
  
  const cSizeField = document.getElementById('container-size-field');
  const cSizeBtns = document.getElementById('container-size-btns');
  
  cSizeField.style.display = 'flex';
  let btnsHtml = '';
  
  if (type === 'SXL') {
    btnsHtml = `
      <button type="button" class="veh-sub-btn" onclick="selectContainerSize('20 ft 7 MT', this)">20 ft 7 MT</button>
      <button type="button" class="veh-sub-btn" onclick="selectContainerSize('22 ft 7 MT', this)">22 ft 7 MT</button>
      <button type="button" class="veh-sub-btn" onclick="selectContainerSize('32 ft 9 MT', this)">32 ft 9 MT</button>
    `;
  } else if (type === 'MXL') {
    btnsHtml = `
      <button type="button" class="veh-sub-btn" onclick="selectContainerSize('32 ft 15 MT', this)">32 ft 15 MT</button>
      <button type="button" class="veh-sub-btn" onclick="selectContainerSize('32 ft 18 MT', this)">32 ft 18 MT</button>
    `;
  }
  
  cSizeBtns.innerHTML = btnsHtml;
}

function selectContainerSize(size, btnEl) {
  document.getElementById('veh-container-size').value = size;
  document.querySelectorAll('#container-size-btns .veh-sub-btn').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
}

async function handleAddVehicle(e) {
  e.preventDefault();
  const number = document.getElementById('veh-number').value.trim().toUpperCase();
  const owner  = document.getElementById('veh-owner').value.trim();
  let type   = document.getElementById('veh-type').value;
  const driver = document.getElementById('veh-driver').value.trim();

  if (!/^[A-Z0-9]+$/.test(number)) {
    showFormError('veh-error', '⚠️ Vehicle number can only contain uppercase alphabets and numbers.');
    return;
  }
  
  if (type === 'Container Truck') {
    const cType = document.getElementById('veh-container-type').value;
    const cSize = document.getElementById('veh-container-size').value;
    if (!cType || !cSize) {
      showFormError('veh-error', '⚠️ Please select both Container Type and Size/Capacity.');
      return;
    }
    type = `Container - ${cType} ${cSize}`;
  }

  const result = await TFP.api('/api/vehicles', {
    method: 'POST',
    body: { vehicleNumber: number, ownerName: owner, driverName: driver, vehicleType: type }
  });
  if (!result.success) {
    showFormError('veh-error', `⚠️ ${result.message || 'Could not add this vehicle.'}`);
    return;
  }

  currentVehicles.push(result.vehicle);
  refreshNotifications();
  document.getElementById('form-add-vehicle').reset();
  handleVehTypeChange('');
  toggleAddVehicleForm();
  renderVehiclesTable();
  refreshStats();
  showToast(`Vehicle ${number} added!`, 'success');
}

/* ── Render vehicles table ── */
function renderVehiclesTable() {
  const vehicles = getVehicles();
  const tbody    = document.getElementById('vehicles-tbody');
  const count    = document.getElementById('vtw-count');
  count.textContent = `${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''} registered`;

  if (vehicles.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No vehicles registered yet. Click "Add Vehicle" to get started.</td></tr>`;
    return;
  }
  tbody.innerHTML = vehicles.map((v, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${v.vehicleNumber}</strong></td>
      <td>${v.ownerName}</td>
      <td>${v.driverName || 'N/A'}</td>
      <td><span class="type-badge">${v.vehicleType}</span></td>
      <td>${new Date(v.addedAt).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}</td>
      <td><button class="btn-del" onclick="deleteVehicle('${v.id}')" title="Delete">🗑️</button></td>
    </tr>
  `).join('');
}

async function deleteVehicle(id) {
  const confirmed = await asyncConfirm('Remove this vehicle?');
  if (!confirmed) return;
  const v = currentVehicles.find(x => x.id === id);
  if (!v) return;

  const result = await TFP.api(`/api/vehicles/${id}`, { method: 'DELETE' });
  if (!result.success) {
    showToast(result.message || 'Could not remove this vehicle.', 'error');
    return;
  }

  currentVehicles = currentVehicles.filter(x => x.id !== id);
  refreshNotifications();
  renderVehiclesTable();
  refreshStats();
  showToast('Vehicle removed.', 'info');
}

/* ════════════════════════════════════════════
   DRIVERS TAB
════════════════════════════════════════════ */
let addDriverPanelOpen = false;

function toggleAddDriverForm() {
  addDriverPanelOpen = !addDriverPanelOpen;
  const panel = document.getElementById('add-driver-panel');
  const btn = document.getElementById('btn-show-add-driver');
  
  panel.style.display = addDriverPanelOpen ? 'block' : 'none';
  if (btn) {
    btn.textContent = addDriverPanelOpen ? '✕ Close' : '➕ Add Driver';
  }
  
  if (addDriverPanelOpen) {
    setTimeout(() => document.getElementById('drv-name').focus(), 100);
  }
}

async function handleAddDriver(e) {
  e.preventDefault();
  const name = document.getElementById('drv-name').value.trim();
  const license = document.getElementById('drv-license').value.trim().toUpperCase();

  if (!/^[A-Z0-9]+$/.test(license)) {
    showFormError('drv-error', '⚠️ Driving License can only contain uppercase alphabets and numbers.');
    return;
  }

  const result = await TFP.api('/api/drivers', { method: 'POST', body: { name, license } });
  if (!result.success) {
    showFormError('drv-error', `⚠️ ${result.message || 'Could not add this driver.'}`);
    return;
  }

  currentDrivers.push(result.driver);
  refreshNotifications();
  document.getElementById('form-add-driver').reset();
  toggleAddDriverForm();
  renderDriversTable();
  showToast(`Driver ${name} added!`, 'success');
}

function renderDriversTable() {
  const drivers = getDrivers();
  const tbody = document.getElementById('drivers-tbody');
  const count = document.getElementById('dtw-count');
  count.textContent = `${drivers.length} driver${drivers.length !== 1 ? 's' : ''} registered`;

  if (drivers.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No drivers registered yet. Click "Add Driver" to get started.</td></tr>`;
    return;
  }
  tbody.innerHTML = drivers.map((d, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${d.name}</strong></td>
      <td>${d.license}</td>
      <td>${new Date(d.addedAt).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}</td>
      <td><button class="btn-del" onclick="deleteDriver('${d.id}')" title="Delete">🗑️</button></td>
    </tr>
  `).join('');
}

async function deleteDriver(id) {
  const confirmed = await asyncConfirm('Remove this driver?');
  if (!confirmed) return;
  const d = currentDrivers.find(x => x.id === id);
  if (!d) return;

  const result = await TFP.api(`/api/drivers/${id}`, { method: 'DELETE' });
  if (!result.success) {
    showToast(result.message || 'Could not remove this driver.', 'error');
    return;
  }

  currentDrivers = currentDrivers.filter(x => x.id !== id);
  refreshNotifications();
  renderDriversTable();
  showToast('Driver removed.', 'info');
}


/* ════════════════════════════════════════════
   TRIP WIZARD STATE
════════════════════════════════════════════ */
let wizard = {
  step: 1,
  vehicleId: null,
  vehicleNumber: '',
  vehicleType: '',
  from: '',
  to: '',
  total: 0,
  advance: 0,
};

function startTripWizard() {
  const vehicles = getVehicles();
  if (vehicles.length === 0) {
    showToast('Please add at least one vehicle first.', 'error');
    switchView('vehicles');
    return;
  }
  // Reset
  wizard = { step: 1, vehicleId: null, vehicleNumber: '', vehicleType: '', from: '', to: '', total: 0, advance: 0 };
  document.getElementById('trip-home').style.display = 'none';
  document.getElementById('trip-wizard').style.display = 'block';
  document.getElementById('trip-from').value    = '';
  document.getElementById('trip-to').value      = '';
  document.getElementById('trip-total').value   = '';
  document.getElementById('trip-advance').value = '';
  gotoWizardStep(1);
}

function cancelWizard() {
  document.getElementById('trip-wizard').style.display = 'none';
  document.getElementById('trip-home').style.display   = 'block';
  renderTripsList();
}

function gotoWizardStep(step) {
  wizard.step = step;
  // Show/hide pages
  for (let i = 1; i <= 8; i++) {
    const page = document.getElementById(`wp-${i}`);
    if (page) {
      page.classList.toggle('hidden', i !== step);
      if (i !== step) page.classList.remove('in');
    }
  }
  // Animate in
  setTimeout(() => {
    const page = document.getElementById(`wp-${step}`);
    if (page) page.style.animation = 'none', setTimeout(() => page.style.animation = '', 10);
  }, 10);

  // Update progress steps
  for (let i = 1; i <= 8; i++) {
    const ws = document.getElementById(`ws-${i}`);
    if (ws) {
      ws.classList.remove('active', 'done');
      if (i < step) ws.classList.add('done');
      else if (i === step) ws.classList.add('active');
    }
  }
  // Lines
  document.querySelectorAll('.wizard-step-line').forEach((line, idx) => {
    line.classList.toggle('done', idx + 1 < step);
  });

  // Back button
  document.getElementById('wizard-back-btn').style.visibility = step > 1 ? 'visible' : 'hidden';

  // Build step-specific UI
  if (step === 1) buildVehicleSelector();
  if (step === 8) buildConfirmCard();
}

function wizardBack() {
  if (wizard.step > 1) gotoWizardStep(wizard.step - 1);
}

function wizardNext(fromStep) {
  if (fromStep === 1) {
    if (!wizard.vehicleId) { showWpError(1, 'Please select a vehicle to continue.'); return; }
    
    // Trip Chain Logic
    const trips = getTrips().filter(t => t.vehicleId === wizard.vehicleId).sort((a,b) => new Date(b.registeredAt) - new Date(a.registeredAt));
    const fromInput = document.getElementById('trip-from');
    let noticeEl = document.getElementById('trip-cycle-notice');
    if (!noticeEl) {
      noticeEl = document.createElement('div');
      noticeEl.id = 'trip-cycle-notice';
      noticeEl.style.cssText = 'color:var(--accent); font-size:0.9rem; margin-bottom:1rem; font-weight:600; padding:0.5rem; background:rgba(var(--accent-rgb),0.1); border-radius:var(--r-sm); border:1px solid rgba(var(--accent-rgb),0.2);';
      fromInput.parentElement.parentElement.insertBefore(noticeEl, fromInput.parentElement);
    }
    
    if (trips.length > 0) {
      const lastTrip = trips[0];
      const cycleOrig = lastTrip.cycleOrigin || lastTrip.from;
      const isCycleClosed = lastTrip.to.trim().toLowerCase() === cycleOrig.trim().toLowerCase();
      
      if (!isCycleClosed) {
        fromInput.value = lastTrip.to;
        fromInput.readOnly = true;
        fromInput.style.opacity = '0.7';
        noticeEl.style.display = 'block';
        noticeEl.innerHTML = `📍 <b>Ongoing Trip Chain</b><br>Vehicle is currently at <b>${lastTrip.to}</b>. It must eventually return to <b>${cycleOrig}</b> to complete the cycle.`;
        wizard.cycleOrigin = cycleOrig;
      } else {
        fromInput.value = '';
        fromInput.readOnly = false;
        fromInput.style.opacity = '1';
        noticeEl.style.display = 'none';
        wizard.cycleOrigin = null;
      }
    } else {
      fromInput.value = '';
      fromInput.readOnly = false;
      fromInput.style.opacity = '1';
      noticeEl.style.display = 'none';
      wizard.cycleOrigin = null;
    }
  }
  if (fromStep === 2) {
    const val = document.getElementById('trip-from').value.trim();
    if (!val) { showWpError(2, 'Please enter the pickup location.'); return; }
    wizard.from = val;
    if (!wizard.cycleOrigin) wizard.cycleOrigin = val; // Set new cycle origin if not inherited
  }
  if (fromStep === 3) {
    const val = document.getElementById('trip-to').value.trim();
    if (!val) { showWpError(3, 'Please enter the delivery location.'); return; }
    wizard.to = val;
  }
  if (fromStep === 4) {
    const val = parseFloat(document.getElementById('trip-total').value);
    if (!val || val <= 0) { showWpError(4, 'Please enter a valid amount greater than 0.'); return; }
    wizard.total = val;
  }
  if (fromStep === 5) {
    const val = parseFloat(document.getElementById('trip-advance').value);
    if (isNaN(val) || val < 0) { showWpError(5, 'Please enter a valid advance amount (0 or more).'); return; }
    if (val > wizard.total) { showWpError(5, `❌ Advance (₹${val.toLocaleString('en-IN')}) cannot exceed total amount (₹${wizard.total.toLocaleString('en-IN')}).`); return; }
    wizard.advance = val;
  }
  if (fromStep === 6) {
    const val = parseInt(document.getElementById('trip-tds-val').value) || 0;
    wizard.tdsRate = val;
  }
  if (fromStep === 7) {
    const type = document.getElementById('trip-gst-type').value;
    const rate = parseInt(document.getElementById('trip-gst-rate').value) || 0;
    if (type !== 'NILL' && rate === 0) {
      showWpError(7, 'Please select a GST rate (5%, 12%, or 18%).');
      return;
    }
    wizard.gstType = type;
    wizard.gstRate = type === 'NILL' ? 0 : rate;
  }
  gotoWizardStep(fromStep + 1);
}

function selectTds(rate) {
  document.getElementById('trip-tds-val').value = rate;
  document.querySelectorAll('.tds-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tds-btn-${rate}`).classList.add('active');
}

function selectGstType(type) {
  document.getElementById('trip-gst-type').value = type;
  document.querySelectorAll('.gst-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`gst-type-${type}`).classList.add('active');
  
  if (type === 'NILL') {
    document.getElementById('gst-rate-selector').style.display = 'none';
    document.getElementById('trip-gst-rate').value = 0;
    document.querySelectorAll('.gst-rate-btn').forEach(btn => btn.classList.remove('active'));
  } else {
    document.getElementById('gst-rate-selector').style.display = 'block';
  }
}

function selectGstRate(rate) {
  document.getElementById('trip-gst-rate').value = rate;
  document.querySelectorAll('.gst-rate-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`gst-rate-${rate}`).classList.add('active');
}

function showWpError(step, msg) {
  const el = document.getElementById(`wp${step}-error`);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

/* ── Vehicle Selector (Step 1) ── */
function buildVehicleSelector() {
  const vehicles = getVehicles();
  const container = document.getElementById('vehicle-selector');
  if (vehicles.length === 0) {
    container.innerHTML = `<div class="vs-no-vehicles">No vehicles found. Add vehicles first.</div>`;
    return;
  }
  container.innerHTML = vehicles.map(v => `
    <div class="vs-option ${wizard.vehicleId === v.id ? 'selected' : ''}"
         onclick="selectVehicle('${v.id}','${v.vehicleNumber}','${v.vehicleType}')">
      <span class="vs-icon">🚛</span>
      <div class="vs-info">
        <div class="vs-number">${v.vehicleNumber}</div>
        <div class="vs-type">${v.vehicleType} · ${v.ownerName}</div>
      </div>
      <div class="vs-check">${wizard.vehicleId === v.id ? '✓' : ''}</div>
    </div>
  `).join('');
}

function selectVehicle(id, number, type) {
  wizard.vehicleId     = id;
  wizard.vehicleNumber = number;
  wizard.vehicleType   = type;
  buildVehicleSelector(); // re-render to show selection
}

/* ── Confirmation Card (Step 8) ── */
function buildConfirmCard() {
  const tdsAmount = Math.round((wizard.total * (wizard.tdsRate || 0)) / 100);
  const gstAmount = Math.round((wizard.total * (wizard.gstRate || 0)) / 100);
  
  const netTotal = wizard.total - tdsAmount + gstAmount;
  const balance = netTotal - wizard.advance;
  
  const balClass = balance > 0 ? 'positive' : '';
  
  let tdsRow = '';
  if (wizard.tdsRate > 0) {
    tdsRow = `
      <div class="cc-row">
        <span class="cc-label" style="color:var(--danger)">TDS Deducted (${wizard.tdsRate}%)</span>
        <span class="cc-value" style="color:var(--danger)">- ₹${tdsAmount.toLocaleString('en-IN')}</span>
      </div>
    `;
  }

  let gstRow = '';
  if (wizard.gstType === 'IGST' && wizard.gstRate > 0) {
    gstRow = `
      <div class="cc-row">
        <span class="cc-label" style="color:var(--accent)">IGST (${wizard.gstRate}%)</span>
        <span class="cc-value" style="color:var(--accent)">+ ₹${gstAmount.toLocaleString('en-IN')}</span>
      </div>
    `;
  } else if (wizard.gstType === 'CSGST' && wizard.gstRate > 0) {
    const halfRate = wizard.gstRate / 2;
    const halfAmount = gstAmount / 2;
    gstRow = `
      <div class="cc-row">
        <span class="cc-label" style="color:var(--accent)">CGST (${halfRate}%)</span>
        <span class="cc-value" style="color:var(--accent)">+ ₹${halfAmount.toLocaleString('en-IN')}</span>
      </div>
      <div class="cc-row">
        <span class="cc-label" style="color:var(--accent)">SGST (${halfRate}%)</span>
        <span class="cc-value" style="color:var(--accent)">+ ₹${halfAmount.toLocaleString('en-IN')}</span>
      </div>
    `;
  }
  
  const netFinalRow = (tdsAmount > 0 || gstAmount > 0) ? `
      <div class="cc-row" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.1);">
        <span class="cc-label" style="font-weight:700; color:var(--success)">Net Final Amount</span>
        <span class="cc-value" style="font-weight:700; color:var(--success)">₹${netTotal.toLocaleString('en-IN')}</span>
      </div>
  ` : '';

  document.getElementById('confirm-card').innerHTML = `
    <div class="cc-row">
      <span class="cc-label">Vehicle</span>
      <span class="cc-value">🚛 ${wizard.vehicleNumber} (${wizard.vehicleType})</span>
    </div>
    <div class="cc-divider"></div>
    <div class="cc-row">
      <span class="cc-label">Pickup From</span>
      <span class="cc-value">📍 ${wizard.from}</span>
    </div>
    <div class="cc-row">
      <span class="cc-label">Deliver To</span>
      <span class="cc-value">🏁 ${wizard.to}</span>
    </div>
    <div class="cc-divider"></div>
    <div class="cc-row">
      <span class="cc-label">Gross Amount</span>
      <span class="cc-value">₹${wizard.total.toLocaleString('en-IN')}</span>
    </div>
    ${tdsRow}
    ${gstRow}
    ${netFinalRow}
    <div class="cc-row" style="margin-top: 0.5rem;">
      <span class="cc-label">Advance Paid</span>
      <span class="cc-value">₹${wizard.advance.toLocaleString('en-IN')}</span>
    </div>
    <div class="cc-divider"></div>
    <div class="cc-row cc-balance-row">
      <span class="cc-label">💰 Balance Remaining</span>
      <span class="cc-value ${balClass}">₹${balance.toLocaleString('en-IN')}</span>
    </div>
  `;
}

/* ── Confirm & Register Trip ── */
async function confirmTrip() {
  // The server recomputes TDS/GST/balance itself from these raw inputs —
  // it never trusts a pre-computed total from the client.
  const result = await TFP.api('/api/trips', {
    method: 'POST',
    body: {
      vehicleId: wizard.vehicleId,
      vehicleNumber: wizard.vehicleNumber,
      vehicleType: wizard.vehicleType,
      from: wizard.from,
      to: wizard.to,
      cycleOrigin: wizard.cycleOrigin,
      total: wizard.total,
      advance: wizard.advance,
      tdsRate: wizard.tdsRate || 0,
      gstType: wizard.gstType || 'NILL',
      gstRate: wizard.gstRate || 0
    }
  });

  if (!result.success) {
    showToast(result.message || 'Could not register this trip.', 'error');
    return;
  }

  currentTrips.push(result.trip);

  document.getElementById('trip-wizard').style.display = 'none';
  document.getElementById('trip-home').style.display = 'block';
  renderTripsList();
  refreshStats();
  showToast('Trip registered successfully!', 'success');
}

/* ════════════════════════════════════════════
   TRIPS LIST
════════════════════════════════════════════ */
function renderTripsList() {
  const trips    = getTrips();
  const count    = document.getElementById('tls-count');
  const container = document.getElementById('trips-list-container');
  const emptyEl  = document.getElementById('trips-empty-state');

  count.textContent = `${trips.length} trip${trips.length !== 1 ? 's' : ''} registered`;

  if (trips.length === 0) {
    container.innerHTML = '';
    container.appendChild(emptyEl || createEmptyState());
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const listEl = document.createElement('div');
  listEl.className = 'trips-list';

  // Build cycles
  const vehicleTripsMap = {};
  trips.forEach(t => {
    if (!vehicleTripsMap[t.vehicleId]) vehicleTripsMap[t.vehicleId] = [];
    vehicleTripsMap[t.vehicleId].push(t);
  });

  const cycles = [];
  Object.keys(vehicleTripsMap).forEach(vid => {
    // Sort oldest to newest
    const vTrips = vehicleTripsMap[vid].sort((a,b) => new Date(a.registeredAt) - new Date(b.registeredAt));
    let currentCycle = [];
    
    vTrips.forEach(t => {
      currentCycle.push(t);
      const cycleOrig = t.cycleOrigin || t.from;
      const isClosed = t.to.trim().toLowerCase() === cycleOrig.trim().toLowerCase();
      if (isClosed) {
        cycles.push([...currentCycle]);
        currentCycle = [];
      }
    });
    if (currentCycle.length > 0) {
      cycles.push([...currentCycle]);
    }
  });

  // Sort cycles by the date of their LATEST trip (newest first)
  cycles.sort((a,b) => new Date(b[b.length-1].registeredAt) - new Date(a[a.length-1].registeredAt));

  cycles.forEach((cycleTrips, cycleIdx) => {
    const cycleNum = cycles.length - cycleIdx;
    
    if (cycleTrips.length === 1) {
      // Standard trip card
      const t = cycleTrips[0];
      const balance = t.balance;
      const isPaid  = t.paid || balance <= 0;
      const card = document.createElement('a');
      card.className = 'trip-card';
      card.href = `trip-detail.html?id=${t.id}`;
      card.innerHTML = `
        <div class="tc-num">${cycleNum}</div>
        <div class="tc-main">
          <div class="tc-route">📍 ${t.from} → ${t.to}</div>
          <div class="tc-vehicle">🚛 ${t.vehicleNumber} · ${t.vehicleType}</div>
        </div>
        <div class="tc-right">
          <div class="tc-amount">₹${t.total.toLocaleString('en-IN')}</div>
          <div class="tc-balance ${isPaid ? 'settled' : 'pending'}">
            ${isPaid ? '✅ Paid' : `⏳ ₹${balance.toLocaleString('en-IN')} due`}
          </div>
          <div class="tc-date">${new Date(t.registeredAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
        </div>
        <span class="tc-arrow">→</span>
      `;
      listEl.appendChild(card);
    } else {
      // Accordion Group
      const firstTrip = cycleTrips[0];
      const lastTrip = cycleTrips[cycleTrips.length - 1];
      const isClosed = lastTrip.to.trim().toLowerCase() === (firstTrip.cycleOrigin || firstTrip.from).trim().toLowerCase();
      const cycleOrig = firstTrip.cycleOrigin || firstTrip.from;
      
      const groupEl = document.createElement('div');
      groupEl.className = 'cycle-group-card';
      groupEl.innerHTML = `
        <div class="cycle-header" onclick="this.parentElement.classList.toggle('expanded')">
          <div class="tc-num" style="margin-right:1rem;">${cycleNum}</div>
          <div class="cycle-summary">
            <div class="cycle-route">📍 ${cycleOrig} ⟷ ${isClosed ? 'Cycle Completed' : lastTrip.to + ' (Ongoing)'}</div>
            <div class="cycle-meta">
              <span>🚛 ${firstTrip.vehicleNumber}</span>
              <span>🔄 ${cycleTrips.length} Trips in Chain</span>
              <span class="cycle-badge ${isClosed ? 'completed' : 'ongoing'}">${isClosed ? 'Completed' : 'Ongoing'}</span>
            </div>
          </div>
          <span class="cycle-expand-icon">▼</span>
        </div>
        <div class="cycle-sub-trips">
          ${cycleTrips.map((t, i) => {
            const isPaid = t.paid || t.balance <= 0;
            return `
              <a href="trip-detail.html?id=${t.id}" class="cycle-sub-trip-card">
                <div class="cst-num">${i + 1}</div>
                <div class="cst-main">
                  <div class="cst-route">${t.from} → ${t.to}</div>
                  <div class="cst-date">${new Date(t.registeredAt).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</div>
                </div>
                <div class="cst-right">
                  <div class="cst-amount">₹${t.total.toLocaleString('en-IN')}</div>
                  <div class="tc-balance ${isPaid ? 'settled' : 'pending'}" style="font-size:0.75rem; display:flex; justify-content:flex-end; align-items:center;">
                    ${isPaid ? '✅ Paid' : `⏳ ₹${t.balance.toLocaleString('en-IN')} due`}
                  </div>
                </div>
                <span class="cst-arrow">→</span>
              </a>
            `;
          }).join('')}
        </div>
      `;
      listEl.appendChild(groupEl);
    }
  });

  container.innerHTML = '';
  container.appendChild(listEl);
}

function createEmptyState() {
  const el = document.createElement('div');
  el.id = 'trips-empty-state';
  el.className = 'empty-state';
  el.innerHTML = `<div class="es-icon">🗺️</div><h3>No trips registered yet</h3><p>Click "Add New Trip" to register your first delivery trip.</p>`;
  return el;
}

/* ════════════════════════════════════════════
   BROKERED TRIPS
════════════════════════════════════════════ */
function getBrokerTrips() {
  return currentBrokerTrips;
}

let bwizard = { step: 1, company: '', owner: '', vehicleNumber: '', from: '', to: '', purchase: 0, sell: 0 };

function startBrokerWizard() {
  document.getElementById('broker-home').style.display = 'none';
  document.getElementById('broker-wizard').style.display = 'block';
  
  bwizard = { step:1, company:'', owner:'', vehicleNumber:'', from:'', to:'', purchase:0, sell:0 };
  ['broker-company','broker-owner','broker-vehicle','broker-from','broker-to','broker-purchase','broker-sell'].forEach(id => {
    document.getElementById(id).value = '';
  });
  
  bwizardGotoStep(1);
}

function cancelBrokerWizard() {
  document.getElementById('broker-wizard').style.display = 'none';
  document.getElementById('broker-home').style.display = 'block';
}

function bwizardBack() {
  if (bwizard.step > 1) bwizardGotoStep(bwizard.step - 1);
  else cancelBrokerWizard();
}

function bwizardGotoStep(step) {
  bwizard.step = step;
  // Show/hide pages
  for (let i = 1; i <= 4; i++) {
    const page = document.getElementById(`bw-step-${i}`);
    if (page) {
      page.classList.toggle('hidden', i !== step);
      if (i !== step) page.classList.remove('in');
    }
  }
  // Animate in
  setTimeout(() => {
    const page = document.getElementById(`bw-step-${step}`);
    if (page) {
      page.style.animation = 'none';
      setTimeout(() => page.style.animation = '', 10);
    }
  }, 10);
  
  // Update progress steps
  for (let i = 1; i <= 4; i++) {
    const ws = document.getElementById(`bws-${i}`);
    if (ws) {
      ws.classList.remove('active', 'completed', 'done');
      if (i < step) ws.classList.add('done');
      else if (i === step) ws.classList.add('active');
    }
  }
  
  // Update step lines
  const wizardContainer = document.getElementById('broker-wizard');
  if (wizardContainer) {
    wizardContainer.querySelectorAll('.wizard-step-line').forEach((line, idx) => {
      line.classList.toggle('done', idx + 1 < step);
    });
  }

  const backBtn = document.getElementById('bwizard-back-btn');
  if (backBtn) {
    backBtn.style.visibility = step > 1 ? 'visible' : 'hidden';
  }
  
  if (step === 4) buildBrokerConfirmCard();
}

function bwizardNext(fromStep) {
  if (fromStep === 1) {
    const c = document.getElementById('broker-company').value.trim();
    const o = document.getElementById('broker-owner').value.trim();
    const v = document.getElementById('broker-vehicle').value.trim().toUpperCase();
    if (!c || !o || !v) { showFormError('bwp1-error', 'Please fill in all details.'); return; }
    if (!/^[A-Z0-9]+$/.test(v)) { showFormError('bwp1-error', 'Vehicle number can only contain uppercase alphabets and numbers.'); return; }
    bwizard.company = c; bwizard.owner = o; bwizard.vehicleNumber = v;
  }
  if (fromStep === 2) {
    const f = document.getElementById('broker-from').value.trim();
    const t = document.getElementById('broker-to').value.trim();
    if (!f || !t) { showFormError('bwp2-error', 'Please fill in both locations.'); return; }
    bwizard.from = f; bwizard.to = t;
  }
  if (fromStep === 3) {
    const p = parseFloat(document.getElementById('broker-purchase').value);
    const s = parseFloat(document.getElementById('broker-sell').value);
    if (!p || p <= 0 || !s || s <= 0) { showFormError('bwp3-error', 'Please enter valid amounts greater than 0.'); return; }
    bwizard.purchase = p; bwizard.sell = s;
  }
  bwizardGotoStep(fromStep + 1);
}

function buildBrokerConfirmCard() {
  const profit = bwizard.sell - bwizard.purchase;
  const plClass = profit > 0 ? 'positive' : (profit < 0 ? 'negative' : '');
  const plText = profit > 0 ? 'Profit' : (profit < 0 ? 'Loss' : 'Break Even');
  const color = profit > 0 ? 'var(--green)' : (profit < 0 ? 'var(--red)' : 'var(--text)');
  
  document.getElementById('broker-confirm-card').innerHTML = `
    <div class="cc-row">
      <span class="cc-label">Company</span>
      <span class="cc-value">🏢 ${bwizard.company}</span>
    </div>
    <div class="cc-row">
      <span class="cc-label">Truck Owner</span>
      <span class="cc-value">👤 ${bwizard.owner} (${bwizard.vehicleNumber})</span>
    </div>
    <div class="cc-divider"></div>
    <div class="cc-row">
      <span class="cc-label">Route</span>
      <span class="cc-value">📍 ${bwizard.from} → 🏁 ${bwizard.to}</span>
    </div>
    <div class="cc-divider"></div>
    <div class="cc-row">
      <span class="cc-label">Sell Amount (Revenue)</span>
      <span class="cc-value">₹${bwizard.sell.toLocaleString('en-IN')}</span>
    </div>
    <div class="cc-row">
      <span class="cc-label">Purchase Amount (Cost)</span>
      <span class="cc-value">₹${bwizard.purchase.toLocaleString('en-IN')}</span>
    </div>
    <div class="cc-divider"></div>
    <div class="cc-row" style="margin-top:1rem; padding:1rem; background:rgba(255,255,255,0.05); border-radius:8px;">
      <span class="cc-label" style="font-weight:700;">Expected ${plText}</span>
      <span class="cc-value" style="font-weight:800; font-size:1.4rem; color:${color}">
        ₹${Math.abs(profit).toLocaleString('en-IN')}
      </span>
    </div>
  `;
}

async function confirmBrokerTrip() {
  const result = await TFP.api('/api/broker-trips', {
    method: 'POST',
    body: {
      company: bwizard.company,
      owner: bwizard.owner,
      vehicleNumber: bwizard.vehicleNumber,
      from: bwizard.from,
      to: bwizard.to,
      purchase: bwizard.purchase,
      sell: bwizard.sell
    }
  });
  if (!result.success) {
    showToast(result.message || 'Could not register this brokered trip.', 'error');
    return;
  }

  currentBrokerTrips.push(result.trip);
  showToast('Brokered trip registered successfully!');
  cancelBrokerWizard();
  renderBrokerList();
  refreshStats();
}

function renderBrokerList() {
  const container = document.getElementById('broker-list-container');
  const countEl = document.getElementById('bls-count');
  const trips = getBrokerTrips();
  
  if (trips.length === 0) {
    countEl.textContent = '0 brokered trips';
    container.innerHTML = `<div class="empty-state" id="broker-empty-state">
      <div class="es-icon">🤝</div>
      <h3>No brokered trips yet</h3>
      <p>Click "Add Brokered Trip" to act as a middleman for a delivery.</p>
    </div>`;
    return;
  }
  
  countEl.textContent = `${trips.length} brokered trip${trips.length > 1 ? 's' : ''}`;
  
  const listEl = document.createElement('div');
  listEl.className = 'trips-list';
  
  trips.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach((t, i) => {
    const profit = t.sell - t.purchase;
    const plColor = profit > 0 ? 'var(--green)' : (profit < 0 ? 'var(--red)' : 'var(--text)');
    
    const card = document.createElement('div');
    card.className = 'trip-card';
    card.style.animationDelay = `${i * 0.05}s`;
    card.style.cursor = 'pointer';
    card.onclick = () => location.href = `brokered-detail.html?id=${t.id}`;
    card.innerHTML = `
      <div class="tc-num" style="background:var(--teal-bg); border-color:var(--teal); color:var(--teal)">🤝</div>
      
      <div class="bc-grid">
        <div class="bc-col">
          <span class="bc-label">Route & Date</span>
          <span class="bc-value" style="font-size:1.05rem">📍 ${t.from} → ${t.to}</span>
          <span style="font-size:0.75rem; color:var(--text3); margin-top:2px">${new Date(t.date).toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'})}</span>
        </div>

        <div class="bc-col">
          <span class="bc-label">Party Details</span>
          <span class="bc-value">🏢 ${t.company}</span>
          <span class="bc-value" style="font-size:0.85rem; color:var(--text2); margin-top:2px">👤 ${t.owner} (${t.vehicleNumber})</span>
        </div>

        <div class="bc-col bc-profit">
          <span class="bc-label">Profit / Loss</span>
          <span class="bc-value" style="color:${plColor}">${profit > 0 ? '+' : ''}₹${profit.toLocaleString('en-IN')}</span>
          <span style="font-size:0.75rem; color:var(--text3); margin-top:2px">
            Rev: ₹${t.sell.toLocaleString('en-IN')} <br/> Cost: ₹${t.purchase.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });
  
  container.innerHTML = '';
  container.appendChild(listEl);
}

/* ════════════════════════════════════════════
   ACCOUNT DETAILS MODAL
════════════════════════════════════════════ */
function renderAccountDetails() {
  const grid = document.getElementById('account-details-grid');
  const fields = [
    ['Full Name',   `${currentUser.firstName} ${currentUser.lastName}`],
    ['Email',       currentUser.email],
    ['Phone',       currentUser.phone],
    ['Role',        fmtRole(currentUser.role)],
    ['Member Since',new Date(currentUser.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})],
    ['Vehicles',    getVehicles().length],
    ['Trips',       getTrips().length],
  ];
  grid.innerHTML = fields.map(([l, v]) =>
    `<div class="ad-row"><span class="ad-label">${l}</span><span class="ad-value">${v}</span></div>`
  ).join('');
}

/* ════════════════════════════════════════════
   CHANGE PASSWORD
════════════════════════════════════════════ */
async function handleChangePassword(e) {
  e.preventDefault();
  const cur  = document.getElementById('pw-current').value;
  const nw   = document.getElementById('pw-new').value;
  const conf = document.getElementById('pw-confirm').value;

  if (nw !== conf)                         { showFormError('pw-error','❌ New passwords do not match.'); return; }
  const pwError = TFP.passwordError(nw);
  if (pwError)                             { showFormError('pw-error', `❌ ${pwError}`); return; }

  try {
    const result = await TFP.api('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: cur, newPassword: nw }
    });
    if (!result.success) {
      showFormError('pw-error', `❌ ${result.message || 'Could not change your password.'}`);
      return;
    }

    document.getElementById('form-change-password').reset();
    showToast('Password changed successfully! Please log in again.', 'success');
    
    // Log out directly without prompt
    TFP.clearSession();
    
    // Create beautiful logout overlay
    const overlay = document.createElement('div');
    overlay.className = 'logout-overlay';
    overlay.innerHTML = `
      <div class="logout-content">
        <div class="lo-icon">🔒</div>
        <h2 class="lo-title">Password Changed</h2>
        <p class="lo-subtitle">Securely logging you out...</p>
      </div>
    `;
    document.body.appendChild(overlay);

    // Trigger animation
    setTimeout(() => overlay.classList.add('show'), 50);

    // Redirect after animation completes
    setTimeout(() => {
      location.href = 'index.html';
    }, 2500);

  } catch (error) {
    showFormError('pw-error', `❌ Error: ${error.message}`);
  }
}

/* ════════════════════════════════════════════
   NOTIFICATIONS MODAL
════════════════════════════════════════════ */
function renderNotifications() {
  const notifs = getNotifications();
  const list = document.getElementById('notif-list');
  if (notifs.length === 0) {
    list.innerHTML = `<div class="notif-empty"><span>🔕</span><p>No notifications yet.</p></div>`;
    return;
  }
  list.innerHTML = notifs.map(n => `
    <div class="notif-item">
      <span class="notif-item-icon">🔔</span>
      <div>
        <div class="notif-item-text">${n.message}</div>
        <div class="notif-item-time">${new Date(n.time).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
      </div>
    </div>
  `).join('');
}

/* ════════════════════════════════════════════
   DELETE ACCOUNT REQUEST
════════════════════════════════════════════ */
async function handleDeleteRequest(e) {
  e.preventDefault();
  if (document.getElementById('del-confirm').value !== 'DELETE') {
    showToast('Type DELETE exactly to confirm.', 'error');
    return;
  }
  
  // 1. Delete the account server-side (cascades vehicles, drivers, trips,
  //    brokered trips and notifications — see backend/db.js's foreign keys)
  const result = await TFP.api('/api/auth/account', { method: 'DELETE' });
  if (!result.success) {
    showToast(result.message || 'Could not delete your account.', 'error');
    return;
  }

  // 2. Clear session
  TFP.clearSession();

  // 4. UI Feedback
  closeSubModal('delete-account');
  showToast('Account deleted permanently!', 'success');
  
  // Custom styled popup that matches the alert box
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="cb-icon" style="font-size: 4rem;">🗑️</div>
      <h3 class="cb-title" style="margin-top:0.5rem; font-size:1.6rem;">Data Wiped Successfully</h3>
      <p class="cb-message" style="margin-top:0.5rem;">Redirecting to home...</p>
    </div>
  `;
  document.body.appendChild(overlay);
  
  // Trigger animation
  setTimeout(() => overlay.classList.add('show'), 50);

  // Redirect after 2.5 seconds
  setTimeout(() => {
    location.href = 'index.html';
  }, 2500);
}

/* ════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════ */
async function handleLogout() {
  const confirmed = await asyncConfirm('Sign out from TruckFleet Pro?');
  if (!confirmed) return;
  TFP.clearSession();

  // Create beautiful logout overlay
  const overlay = document.createElement('div');
  overlay.className = 'logout-overlay';
  overlay.innerHTML = `
    <div class="logout-content">
      <div class="lo-icon">👋</div>
      <h2 class="lo-title">See you soon!</h2>
      <p class="lo-subtitle">Securely logging you out...</p>
    </div>
  `;
  document.body.appendChild(overlay);

  // Trigger animation
  setTimeout(() => overlay.classList.add('show'), 50);

  // Redirect after animation completes
  setTimeout(() => {
    location.href = 'index.html';
  }, 2500);
}

/* ════════════════════════════════════════════
   SUB-MODAL SYSTEM
════════════════════════════════════════════ */
function openSubModal(type) {
  closeSideMenu();
  if (type === 'account-details') renderAccountDetails();
  if (type === 'notifications')   renderNotifications();
  if (type === 'change-role')     selectRole(currentUser.role || 'fleet-owner');
  if (type === 'appearance')      renderAppearanceModal();
  document.getElementById(`modal-${type}`).classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeSubModal(type) {
  document.getElementById(`modal-${type}`).classList.remove('active');
  document.body.style.overflow = '';
}
function closeSubModalOnOverlay(e, type) {
  if (e.target === e.currentTarget) closeSubModal(type);
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['account-details','change-role','appearance','change-password','notifications','help','delete-account','salary'].forEach(t => closeSubModal(t));
  closeSideMenu();
});

/* ════════════════════════════════════════════
   TOAST & FORM ERROR HELPERS
════════════════════════════════════════════ */
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  document.getElementById('toast-icon').textContent = icons[type] || '✅';
  document.getElementById('toast-msg').textContent  = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function showFormError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4500);
}


/* ════════════════════════════════════════════
   SALARY TAB LOGIC
════════════════════════════════════════════ */
let currentSalarySearchQuery = '';

function handleSalaryInput(query) {
  currentSalarySearchQuery = query.trim();
  const autocomplete = document.getElementById('salary-autocomplete');
  
  if (!currentSalarySearchQuery) {
    autocomplete.style.display = 'none';
    return;
  }
  
  const drivers = getDrivers();
  const matched = drivers.filter(d => 
    d.name.toLowerCase().includes(currentSalarySearchQuery.toLowerCase()) || 
    d.license.toLowerCase().includes(currentSalarySearchQuery.toLowerCase())
  ).slice(0, 5); // Limit to 5 suggestions
  
  if (matched.length === 0) {
    autocomplete.innerHTML = '<div class="salary-empty" style="padding:1rem;">No matching drivers found.</div>';
    autocomplete.style.display = 'block';
    return;
  }
  
  autocomplete.innerHTML = matched.map(d => {
    return `
      <div class="auto-item" onclick="selectSalaryAutocomplete('${d.id}', '${d.name.replace(/'/g, "\\'")}')">
        <div class="auto-avatar">${d.name[0].toUpperCase()}</div>
        <div>
          <div class="auto-name">${d.name}</div>
          <div class="auto-license">${d.license}</div>
        </div>
      </div>
    `;
  }).join('');
  
  autocomplete.style.display = 'block';
}

function selectSalaryAutocomplete(driverId, driverName) {
  document.getElementById('salary-search-input').value = driverName;
  document.getElementById('salary-autocomplete').style.display = 'none';
  currentSalarySearchQuery = driverName;
  executeSalarySearch();
}

function executeSalarySearch() {
  document.getElementById('salary-autocomplete').style.display = 'none';
  const container = document.getElementById('salary-results-container');
  
  if (!currentSalarySearchQuery) {
    container.innerHTML = '<div class="salary-empty">Start typing and click Search...</div>';
    return;
  }
  
  const drivers = getDrivers();
  const matched = drivers.filter(d => 
    d.name.toLowerCase().includes(currentSalarySearchQuery.toLowerCase()) || 
    d.license.toLowerCase().includes(currentSalarySearchQuery.toLowerCase())
  );
  
  if (matched.length === 0) {
    container.innerHTML = '<div class="salary-empty">No drivers found matching your search.</div>';
    return;
  }
  
  container.innerHTML = matched.map(d => {
    return `
      <div class="salary-driver-card" onclick="openSalaryModal('${d.id}', '${d.name.replace(/'/g, "\\'")}')">
        <div class="sd-info">
          <div class="sd-avatar">${d.name[0].toUpperCase()}</div>
          <div>
            <div class="sd-name">${d.name}</div>
            <div class="sd-license">${d.license}</div>
          </div>
        </div>
        <button class="sd-salary-btn">Enter Salary</button>
      </div>
    `;
  }).join('');
}

function openSalaryModal(driverId, driverName) {
  document.getElementById('salary-driver-id').value = driverId;
  document.getElementById('salary-driver-name').textContent = `Driver: ${driverName}`;
  document.getElementById('salary-amount').value = '';
  openSubModal('salary');
}

async function handleSaveSalary(e) {
  e.preventDefault();
  const driverId = document.getElementById('salary-driver-id').value;
  const amount = document.getElementById('salary-amount').value;
  
  if (!driverId || !amount) return;

  const result = await TFP.api(`/api/drivers/${driverId}/salary`, { method: 'PATCH', body: { amount: Number(amount) } });
  if (!result.success) {
    showToast(result.message || 'Could not save this salary.', 'error');
    return;
  }

  const idx = currentDrivers.findIndex(d => d.id === driverId);
  if (idx > -1) currentDrivers[idx] = result.driver;

  closeSubModal('salary');
  showToast(`Salary of ₹${amount} saved for ${result.driver.name}!`, 'success');
  
  document.getElementById('salary-search-input').value = '';
  currentSalarySearchQuery = '';
  document.getElementById('salary-results-container').innerHTML = '<div class="salary-empty">Start typing and click Search...</div>';
  
  // Refresh status if we are on that tab
  renderSalaryStatus();
}

function switchSalaryTab(tab) {
  const btnAssign = document.getElementById('stab-assign');
  const btnStatus = document.getElementById('stab-status');
  const secAssign = document.getElementById('salary-assign-section');
  const secStatus = document.getElementById('salary-status-section');
  const subtitle = document.getElementById('salary-subtitle');
  
  if (tab === 'assign') {
    btnAssign.classList.add('active');
    btnStatus.classList.remove('active');
    secAssign.style.display = 'block';
    secStatus.style.display = 'none';
    subtitle.textContent = "Search for a driver to manage their monthly salary";
  } else {
    btnStatus.classList.add('active');
    btnAssign.classList.remove('active');
    secStatus.style.display = 'block';
    secAssign.style.display = 'none';
    subtitle.textContent = "Check and update payment status for assigned salaries";
    renderSalaryStatus();
  }
}

function renderSalaryStatus() {
  const container = document.getElementById('salary-status-container');
  const drivers = getDrivers().filter(d => d.lastSalary);
  
  if (drivers.length === 0) {
    container.innerHTML = '<div class="salary-empty">No salaries have been assigned yet. Go to Assign Salary to add one.</div>';
    return;
  }
  
  // Sort: Unpaid first, Paid last. If both same, sort alphabetically
  drivers.sort((a, b) => {
    if (a.isSalaryPaid === b.isSalaryPaid) {
      return a.name.localeCompare(b.name);
    }
    return a.isSalaryPaid ? 1 : -1;
  });
  
  container.innerHTML = drivers.map(d => {
    const isPaid = !!d.isSalaryPaid;
    return `
      <div class="salary-status-card ${isPaid ? 'paid' : ''}" id="statcard-${d.id}">
        <div class="sd-info">
          <div class="sd-avatar">${d.name[0].toUpperCase()}</div>
          <div>
            <div class="sd-name">${d.name}</div>
            <div class="sd-license">${d.license}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap: 1.5rem;">
          <div class="salary-status-amount">₹${d.lastSalary}</div>
          <label class="ss-checkbox-wrap">
            <input type="checkbox" class="ss-checkbox" ${isPaid ? 'checked' : ''} onclick="toggleSalaryPaid('${d.id}')">
            <span class="ss-check-label">${isPaid ? 'Paid' : 'Pending'}</span>
          </label>
        </div>
      </div>
    `;
  }).join('');
}

async function toggleSalaryPaid(driverId) {
  const driver = currentDrivers.find(d => d.id === driverId);
  if (!driver) return;

  const result = await TFP.api(`/api/drivers/${driverId}/salary-status`, { method: 'PATCH' });
  if (!result.success) {
    showToast(result.message || 'Could not update salary status.', 'error');
    renderSalaryStatus(); // revert the checkbox's optimistic UI state
    return;
  }
  const idx = currentDrivers.findIndex(d => d.id === driverId);
  currentDrivers[idx] = result.driver;

  const card = document.getElementById(`statcard-${driverId}`);
  if (card) {
    // Add a quick animation effect before re-rendering
    card.style.transform = 'scale(0.95)';
    card.style.opacity = '0.5';

    // Wait for the visual effect, then re-render the list to sort it
    setTimeout(() => {
      renderSalaryStatus();
      if (result.driver.isSalaryPaid) {
         showToast(`Marked as paid for ${result.driver.name}`, 'success');
      } else {
         showToast(`Marked as pending for ${result.driver.name}`, 'info');
      }
    }, 400); // 400ms delay for smoothness
  } else {
    renderSalaryStatus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('salary-results-container');
  if (container) {
    container.innerHTML = '<div class="salary-empty">Start typing and click Search...</div>';
  }
});

