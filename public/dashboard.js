/* ════════════════════════════════════════════
   TRUCKFLEET PRO — dashboard.js  v3.0
   ════════════════════════════════════════════ */

/* ── Excel import helpers (shared by Vehicles/Drivers/Salary) ── */

/* Reads an .xlsx/.xls File into an array of row objects via SheetJS. Rejects
   on anything that isn't a readable spreadsheet, so callers can show one
   clear error instead of letting a parse exception bubble up. */
function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') {
      reject(new Error('Excel library failed to load. Check your connection and try again.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
      } catch (err) {
        reject(new Error('That file doesn\'t look like a valid Excel spreadsheet.'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/* Column headers are matched case-insensitively against a list of accepted
   aliases, so a file re-exported from this app (or lightly hand-edited)
   still imports correctly even if a header's capitalization changed. */
function findColumn(row, aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const match = keys.find(k => k.trim().toLowerCase() === alias);
    if (match !== undefined && String(row[match]).trim() !== '') return row[match];
  }
  return undefined;
}

function summarizeImport(parts, verb) {
  return parts.length ? `Import complete: ${parts.join(', ')}.` : `Nothing was ${verb}.`;
}

/* ── Date helpers (shared by the Trip and Brokered Trip wizards) ──
   <input type="date"> gives "YYYY-MM-DD" with no time-of-day. Parsing that
   directly as `new Date("YYYY-MM-DD")` reads it as UTC midnight, which
   renders as the PREVIOUS day in any timezone behind UTC — so it's
   combined with the current time-of-day instead, keeping the chosen date
   correct wherever the user actually is. */
function todayDateInputValue() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateInputToISOString(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const now = new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}

/* ── Auth guard & Global State ── */
let currentUser = null;
let currentVehicles = [];
let currentTrips = [];
let currentBrokerTrips = [];
let currentNotifications = [];
let currentDrivers = [];

// All real data lives in Firestore under users/{uid}/..., scoped to the
// signed-in Google account — see firebase-init.js's FS helper.
let uid = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await FS.waitForUser();
  if (!user) {
    location.href = 'index.html';
    return;
  }
  uid = user.uid;

  const profile = await FS.ensureUserProfile(user);
  currentUser = Object.assign({ id: uid }, profile);
  renderSidemenuIdentity();

  // A driver account never touches the Fleet Owner's vehicles/trips/etc.
  // data at all — it only ever sees the one trip an owner has assigned to
  // it, via driver.js. See firestore.rules for what makes this safe.
  if (currentUser.role === 'driver') {
    await initDriverDashboard();
    document.body.classList.remove('app-loading');
    return;
  }

  const [vehicles, drivers, trips, brokerTrips, notifications] = await Promise.all([
    FS.getAll(uid, 'vehicles'),
    FS.getAll(uid, 'drivers'),
    FS.getAll(uid, 'trips'),
    FS.getAll(uid, 'brokerTrips'),
    FS.getAll(uid, 'notifications')
  ]);
  currentVehicles = vehicles;
  currentDrivers = drivers;
  currentTrips = trips;
  currentBrokerTrips = brokerTrips;
  currentNotifications = notifications.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 25);

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

  // Real data is in and rendered — safe to reveal the page now
  document.body.classList.remove('app-loading');
});

function renderSidemenuIdentity() {
  const lastNameStr = currentUser.lastName ? ` ${currentUser.lastName}` : '';
  document.getElementById('sidemenu-name').textContent = `${currentUser.firstName}${lastNameStr}`;
  document.getElementById('sidemenu-role').textContent = fmtRole(currentUser.role);
  document.getElementById('sidemenu-avatar').textContent = (currentUser.firstName || 'U')[0].toUpperCase();
}

/* ── State helpers — currentX arrays are the local cache; every mutation
   below writes to Firestore first and only updates the cache once it succeeds ── */
function getVehicles() { return currentVehicles; }
function getDrivers() { return currentDrivers; }
function getTrips() { return currentTrips; }
function getNotifications() { return currentNotifications; }

async function refreshNotifications() {
  const notifications = await FS.getAll(uid, 'notifications');
  currentNotifications = notifications.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 25);
  updateNotifBadge();
  renderNotifications();
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  const count = currentNotifications.length;
  badge.style.display = count > 0 ? 'block' : 'none';
  badge.textContent = count > 9 ? '9+' : count;
}

/* ════════════════════════════════════════════
   ROW ACTION MENU (three-dot ⋮ menu — Vehicles/Drivers rows, Trip/Broker cards)
════════════════════════════════════════════ */
function closeAllRowMenus() {
  document.querySelectorAll('.row-menu-dropdown.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.row-menu-btn.active').forEach(b => b.classList.remove('active'));
}
function toggleRowMenu(btn, event) {
  event.stopPropagation();
  const dropdown = btn.nextElementSibling;
  const wasOpen = dropdown.classList.contains('open');
  closeAllRowMenus();
  if (wasOpen) return;

  const rect = btn.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.top = (rect.bottom + 4) + 'px';
  dropdown.style.left = 'auto';
  dropdown.style.right = (window.innerWidth - rect.right) + 'px';
  dropdown.classList.add('open');
  btn.classList.add('active');

  requestAnimationFrame(() => {
    const dRect = dropdown.getBoundingClientRect();
    if (dRect.bottom > window.innerHeight) {
      dropdown.style.top = Math.max(4, rect.top - dRect.height - 4) + 'px';
    }
  });
}
document.addEventListener('click', closeAllRowMenus);
document.addEventListener('scroll', closeAllRowMenus, true);

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
/* Role is chosen once at sign-up (see index.html's "I am a..." picker) and
   locked from then on — firestore.rules rejects any update that touches the
   role field, so this modal only ever displays it, never edits it. */
const ROLE_INFO = {
  'fleet-owner': { icon: '🚛', name: 'Fleet Owner / Truck Owner', desc: 'You own trucks and take delivery contracts' },
  'company':     { icon: '🏢', name: 'Company', desc: 'You hire trucks to move your goods' },
  'driver':      { icon: '👨‍✈️', name: 'Truck Driver', desc: 'You drive trucks for fleet owners' }
};

function renderRoleView() {
  const role = ROLE_INFO[currentUser.role] ? currentUser.role : 'fleet-owner';
  const info = ROLE_INFO[role];
  document.getElementById('role-option-list').innerHTML = `
    <div class="role-option-btn selected" style="cursor:default;">
      <span class="role-opt-icon">${info.icon}</span>
      <div class="role-opt-info">
        <span class="role-opt-name">${info.name}</span>
        <span class="role-opt-desc">${info.desc}</span>
      </div>
      <span class="role-opt-check">🔒</span>
    </div>
  `;
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
let editingVehicleId = null;

function resetVehicleFormToAddMode() {
  editingVehicleId = null;
  document.getElementById('veh-panel-title').textContent = 'Register a New Vehicle';
  document.getElementById('veh-submit-btn').textContent = '➕ Add Vehicle';
  document.getElementById('form-add-vehicle').reset();
  handleVehTypeChange('');
}

/* Opens the Add Vehicle panel pre-filled with an existing vehicle's data —
   submitting runs FS.update instead of FS.add (see handleAddVehicle). */
function editVehicle(id) {
  const v = currentVehicles.find(x => x.id === id);
  if (!v) return;

  editingVehicleId = id;
  if (!addVehiclePanelOpen) toggleAddVehicleForm();

  document.getElementById('veh-panel-title').textContent = `Edit Vehicle — ${v.vehicleNumber}`;
  document.getElementById('veh-submit-btn').textContent = '💾 Save Changes';
  document.getElementById('veh-number').value = v.vehicleNumber;
  document.getElementById('veh-owner').value = v.ownerName;
  document.getElementById('veh-driver').value = v.driverName || '';

  if (v.vehicleType && v.vehicleType.startsWith('Container - ')) {
    const rest = v.vehicleType.slice('Container - '.length); // e.g. "SXL 20 ft 7 MT"
    const [cType, ...sizeParts] = rest.split(' ');
    const cSize = sizeParts.join(' ');
    setSelectValue('veh-type', 'Container Truck');
    handleVehTypeChange('Container Truck');
    selectContainerType(cType);
    setTimeout(() => {
      document.querySelectorAll('#container-size-btns .veh-sub-btn').forEach(btn => {
        if (btn.textContent.trim() === cSize) selectContainerSize(cSize, btn);
      });
    }, 0);
  } else {
    setSelectValue('veh-type', v.vehicleType || '');
    handleVehTypeChange(v.vehicleType || '');
  }

  document.getElementById('add-vehicle-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Sets a native <select>'s value and keeps custom-select.js's visible
   dropdown UI in sync — plain select.value alone doesn't update it. */
function setSelectValue(selectId, value) {
  const sel = document.getElementById(selectId);
  sel.value = value;
  if (sel._syncCustom) sel._syncCustom();
}

function toggleAddVehicleForm() {
  addVehiclePanelOpen = !addVehiclePanelOpen;
  if (!addVehiclePanelOpen) resetVehicleFormToAddMode();
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

  if (currentVehicles.some(v => v.vehicleNumber === number && v.id !== editingVehicleId)) {
    showFormError('veh-error', '⚠️ This vehicle number is already registered.');
    return;
  }

  const data = { vehicleNumber: number, ownerName: owner, driverName: driver, vehicleType: type };

  if (editingVehicleId) {
    try {
      await FS.update(uid, 'vehicles', editingVehicleId, data);
    } catch (err) {
      showFormError('veh-error', `⚠️ ${err.message || 'Could not save these changes.'}`);
      return;
    }
    const existing = currentVehicles.find(v => v.id === editingVehicleId);
    Object.assign(existing, data);
    await FS.addNotification(uid, `Vehicle updated: ${number}`);
    refreshNotifications();
    toggleAddVehicleForm();
    renderVehiclesTable();
    showToast(`Vehicle ${number} updated!`, 'success');
    return;
  }

  let vehicle;
  try {
    vehicle = await FS.add(uid, 'vehicles', Object.assign({ addedAt: new Date().toISOString() }, data));
  } catch (err) {
    showFormError('veh-error', `⚠️ ${err.message || 'Could not add this vehicle.'}`);
    return;
  }

  currentVehicles.push(vehicle);
  await FS.addNotification(uid, `New vehicle added: ${number} (${type})`);
  refreshNotifications();
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
      <td class="td-row-actions">
        <div class="row-menu">
          <button class="row-menu-btn" onclick="toggleRowMenu(this, event)" title="Actions">⋮</button>
          <div class="row-menu-dropdown">
            <button class="row-menu-item" onclick="editVehicle('${v.id}')">✏️ Edit</button>
            <button class="row-menu-item row-menu-danger" onclick="deleteVehicle('${v.id}')">🗑️ Delete</button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

/* ── Export every registered vehicle (one row each) to a real .xlsx file via
   SheetJS. Vehicle Number is forced to a text cell so Excel can't
   reinterpret plates like "0587KL12" as a number and strip the leading
   zero. ── */
function exportVehiclesToExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel export library failed to load. Check your connection and try again.', 'error');
    return;
  }
  const vehicles = getVehicles();
  if (vehicles.length === 0) {
    showToast('No vehicles to export.', 'error');
    return;
  }

  const rows = vehicles.map((v, i) => ({
    'S.No': i + 1,
    'Vehicle Number': v.vehicleNumber,
    'Owner Name': v.ownerName,
    'Driver Name': v.driverName || 'N/A',
    'Category': v.vehicleType,
    'Registered On': new Date(v.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  const range = XLSX.utils.decode_range(ws['!ref']);
  const vehicleNumberCol = 1; // 0-based: "Vehicle Number" is the 2nd column
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: vehicleNumberCol });
    if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; }
  }
  ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 24 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vehicles');

  const fileName = `TruckFleet-Vehicles-${new Date().toISOString().slice(0, 10)}.xlsx`;

  XLSX.writeFile(wb, fileName);
  showToast(`Exported ${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''} to Excel.`, 'success');
}

async function handleVehicleImportFile(event) {
  const file = event.target.files[0];
  event.target.value = ''; // lets the user re-pick the same file later
  if (!file) return;
  await importVehiclesFromExcel(file);
}

/* ── Import vehicles from an .xlsx file. Accepts the same headers this app
   exports (Vehicle Number, Owner Name, Driver Name, Category) — vehicles
   already registered (matched by number) are skipped, not duplicated. ── */
async function importVehiclesFromExcel(file) {
  let rows;
  try {
    rows = await readExcelFile(file);
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }
  if (rows.length === 0) {
    showToast('That file has no rows to import.', 'error');
    return;
  }

  const existingNumbers = new Set(currentVehicles.map(v => v.vehicleNumber));
  let added = 0, skipped = 0, invalid = 0;

  for (const row of rows) {
    const number = String(findColumn(row, ['vehicle number', 'vehicle no', 'number']) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const owner = String(findColumn(row, ['owner name', 'owner']) || '').trim();
    const driver = String(findColumn(row, ['driver name', 'driver']) || '').trim();
    const type = String(findColumn(row, ['category', 'vehicle type / subtype', 'vehicle type', 'type']) || '').trim();

    if (!number || !owner || !type) { invalid++; continue; }
    if (existingNumbers.has(number)) { skipped++; continue; }

    try {
      const vehicle = await FS.add(uid, 'vehicles', { vehicleNumber: number, ownerName: owner, driverName: driver, vehicleType: type, addedAt: new Date().toISOString() });
      currentVehicles.push(vehicle);
      existingNumbers.add(number);
      added++;
    } catch (err) {
      invalid++;
    }
  }

  renderVehiclesTable();
  refreshStats();
  if (added > 0) {
    await FS.addNotification(uid, `Imported ${added} vehicle${added !== 1 ? 's' : ''} from Excel`);
    refreshNotifications();
  }

  const parts = [];
  if (added) parts.push(`${added} added`);
  if (skipped) parts.push(`${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped`);
  if (invalid) parts.push(`${invalid} row${invalid !== 1 ? 's' : ''} had missing data`);
  showToast(summarizeImport(parts, 'imported'), added > 0 ? 'success' : 'error');
}

async function deleteTrip(id) {
  const confirmed = await asyncConfirm('Delete this trip? This cannot be undone.');
  if (!confirmed) return;
  const t = currentTrips.find(x => x.id === id);
  if (!t) return;

  try {
    await FS.remove(uid, 'trips', id);
  } catch (err) {
    showToast(err.message || 'Could not delete this trip.', 'error');
    return;
  }

  currentTrips = currentTrips.filter(x => x.id !== id);
  await FS.addNotification(uid, `Trip removed: ${t.from} → ${t.to}`);
  refreshNotifications();
  renderTripsList();
  refreshStats();
  showToast('Trip deleted.', 'info');
}

async function deleteBrokerTrip(id) {
  const confirmed = await asyncConfirm('Delete this brokered trip? This cannot be undone.');
  if (!confirmed) return;
  const t = currentBrokerTrips.find(x => x.id === id);
  if (!t) return;

  try {
    await FS.remove(uid, 'brokerTrips', id);
  } catch (err) {
    showToast(err.message || 'Could not delete this brokered trip.', 'error');
    return;
  }

  currentBrokerTrips = currentBrokerTrips.filter(x => x.id !== id);
  await FS.addNotification(uid, `Brokered trip removed: ${t.from} → ${t.to}`);
  refreshNotifications();
  renderBrokerList();
  refreshStats();
  showToast('Brokered trip deleted.', 'info');
}

async function deleteVehicle(id) {
  const confirmed = await asyncConfirm('Remove this vehicle?');
  if (!confirmed) return;
  const v = currentVehicles.find(x => x.id === id);
  if (!v) return;

  try {
    await FS.remove(uid, 'vehicles', id);
  } catch (err) {
    showToast(err.message || 'Could not remove this vehicle.', 'error');
    return;
  }

  currentVehicles = currentVehicles.filter(x => x.id !== id);
  await FS.addNotification(uid, `Vehicle removed: ${v.vehicleNumber}`);
  refreshNotifications();
  renderVehiclesTable();
  refreshStats();
  showToast('Vehicle removed.', 'info');
}

/* ════════════════════════════════════════════
   DRIVERS TAB
════════════════════════════════════════════ */
let addDriverPanelOpen = false;
let editingDriverId = null;

function resetDriverFormToAddMode() {
  editingDriverId = null;
  document.getElementById('drv-panel-title').textContent = 'Register a New Driver';
  document.getElementById('drv-submit-btn').textContent = '➕ Add Driver';
  document.getElementById('form-add-driver').reset();
}

function editDriver(id) {
  const d = currentDrivers.find(x => x.id === id);
  if (!d) return;

  editingDriverId = id;
  if (!addDriverPanelOpen) toggleAddDriverForm();

  document.getElementById('drv-panel-title').textContent = `Edit Driver — ${d.name}`;
  document.getElementById('drv-submit-btn').textContent = '💾 Save Changes';
  document.getElementById('drv-name').value = d.name;
  document.getElementById('drv-license').value = d.license;
  document.getElementById('drv-email').value = d.email || '';

  document.getElementById('add-driver-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleAddDriverForm() {
  addDriverPanelOpen = !addDriverPanelOpen;
  if (!addDriverPanelOpen) resetDriverFormToAddMode();
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
  const email = document.getElementById('drv-email').value.trim().toLowerCase();

  if (!/^[A-Z0-9]+$/.test(license)) {
    showFormError('drv-error', '⚠️ Driving License can only contain uppercase alphabets and numbers.');
    return;
  }

  if (currentDrivers.some(d => d.license === license && d.id !== editingDriverId)) {
    showFormError('drv-error', '⚠️ This driving license is already registered.');
    return;
  }

  if (editingDriverId) {
    const existing = currentDrivers.find(d => d.id === editingDriverId);
    const data = { name, license, email: email || '' };
    try {
      await FS.update(uid, 'drivers', editingDriverId, data);
    } catch (err) {
      showFormError('drv-error', `⚠️ ${err.message || 'Could not save these changes.'}`);
      return;
    }
    // A newly-added or changed email gets its own invite so the driver can
    // still claim access — see FS.createDriverInvite.
    if (email && email !== existing.email) {
      try { await FS.createDriverInvite(email, uid, editingDriverId); } catch (err) {
        showToast(`Driver saved, but couldn't set up app access yet: ${err.message || 'unknown error'}`, 'error');
      }
    }
    Object.assign(existing, data);
    await FS.addNotification(uid, `Driver updated: ${name}`);
    refreshNotifications();
    toggleAddDriverForm();
    renderDriversTable();
    showToast(`Driver ${name} updated!`, 'success');
    return;
  }

  let driver;
  try {
    driver = await FS.add(uid, 'drivers', { name, license, email: email || '', addedAt: new Date().toISOString() });
  } catch (err) {
    showFormError('drv-error', `⚠️ ${err.message || 'Could not add this driver.'}`);
    return;
  }

  currentDrivers.push(driver);

  // The driver record itself is saved either way — the invite is a
  // separate, best-effort step so its failure (e.g. rules not deployed
  // yet, a flaky connection) never leaves a "phantom" driver the UI thinks
  // failed to save. Re-adding the email later (or re-saving this driver)
  // can always retry the invite.
  if (email) {
    try {
      await FS.createDriverInvite(email, uid, driver.id);
    } catch (err) {
      showToast(`Driver saved, but couldn't set up app access yet: ${err.message || 'unknown error'}`, 'error');
    }
  }

  await FS.addNotification(uid, `New driver added: ${name}`);
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
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No drivers registered yet. Click "Add Driver" to get started.</td></tr>`;
    return;
  }
  tbody.innerHTML = drivers.map((d, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${d.name}</strong></td>
      <td>${d.license}</td>
      <td>${d.email ? '<span class="type-badge">✉️ Invited</span>' : '<span class="type-badge" style="opacity:.6">No email</span>'}</td>
      <td>${new Date(d.addedAt).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}</td>
      <td class="td-row-actions">
        <div class="row-menu">
          <button class="row-menu-btn" onclick="toggleRowMenu(this, event)" title="Actions">⋮</button>
          <div class="row-menu-dropdown">
            <button class="row-menu-item" onclick="editDriver('${d.id}')">✏️ Edit</button>
            <button class="row-menu-item row-menu-danger" onclick="deleteDriver('${d.id}')">🗑️ Delete</button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');
}

/* ── Export every registered driver (one row each) to a real .xlsx file. ── */
function exportDriversToExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel export library failed to load. Check your connection and try again.', 'error');
    return;
  }
  const drivers = getDrivers();
  if (drivers.length === 0) {
    showToast('No drivers to export.', 'error');
    return;
  }

  const rows = drivers.map((d, i) => ({
    'S.No': i + 1,
    'Driver Name': d.name,
    'Driving License': d.license,
    'Added On': new Date(d.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref']);
  const licenseCol = 2; // 0-based: "Driving License" is the 3rd column
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: licenseCol });
    if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; }
  }
  ws['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Drivers');
  XLSX.writeFile(wb, `TruckFleet-Drivers-${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast(`Exported ${drivers.length} driver${drivers.length !== 1 ? 's' : ''} to Excel.`, 'success');
}

async function handleDriverImportFile(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  await importDriversFromExcel(file);
}

/* ── Import drivers from an .xlsx file. Accepts Driver Name + Driving
   License headers — drivers already registered (matched by license) are
   skipped, not duplicated. ── */
async function importDriversFromExcel(file) {
  let rows;
  try {
    rows = await readExcelFile(file);
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }
  if (rows.length === 0) {
    showToast('That file has no rows to import.', 'error');
    return;
  }

  const existingLicenses = new Set(currentDrivers.map(d => d.license));
  let added = 0, skipped = 0, invalid = 0;

  for (const row of rows) {
    const name = String(findColumn(row, ['driver name', 'name']) || '').trim();
    const license = String(findColumn(row, ['driving license', 'license', 'license number']) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!name || !license) { invalid++; continue; }
    if (existingLicenses.has(license)) { skipped++; continue; }

    try {
      const driver = await FS.add(uid, 'drivers', { name, license, addedAt: new Date().toISOString() });
      currentDrivers.push(driver);
      existingLicenses.add(license);
      added++;
    } catch (err) {
      invalid++;
    }
  }

  renderDriversTable();
  if (added > 0) {
    await FS.addNotification(uid, `Imported ${added} driver${added !== 1 ? 's' : ''} from Excel`);
    refreshNotifications();
  }

  const parts = [];
  if (added) parts.push(`${added} added`);
  if (skipped) parts.push(`${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped`);
  if (invalid) parts.push(`${invalid} row${invalid !== 1 ? 's' : ''} had missing data`);
  showToast(summarizeImport(parts, 'imported'), added > 0 ? 'success' : 'error');
}

async function deleteDriver(id) {
  const confirmed = await asyncConfirm('Remove this driver?');
  if (!confirmed) return;
  const d = currentDrivers.find(x => x.id === id);
  if (!d) return;

  try {
    await FS.remove(uid, 'drivers', id);
  } catch (err) {
    showToast(err.message || 'Could not remove this driver.', 'error');
    return;
  }

  currentDrivers = currentDrivers.filter(x => x.id !== id);
  await FS.addNotification(uid, `Driver removed: ${d.name}`);
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
  document.getElementById('trip-cargo-info').value = '';
  document.getElementById('trip-party-name').value = '';
  document.getElementById('trip-party-phone').value = '';
  document.getElementById('trip-date').value = todayDateInputValue();
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

  // On phones the step strip scrolls horizontally — keep the active circle in view
  const activeStep = document.getElementById(`ws-${step}`);
  if (activeStep) activeStep.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

  // Build step-specific UI
  if (step === 1) buildVehicleSelector();
  if (step === 8) { buildConfirmCard(); populateTripDriverSelect(); }
}

/* Only drivers who've actually signed up and claimed their invite (see
   firebase-init.js's claimDriverInvite / driver.js) can be assigned to a
   trip — assigning an uncleared invite would leave assignedDriverUid unset
   and the trip would never become visible to them. */
async function populateTripDriverSelect() {
  const sel = document.getElementById('trip-assign-driver');
  const driversWithEmail = currentDrivers.filter(d => d.email);
  if (driversWithEmail.length === 0) return;

  const invites = await Promise.all(driversWithEmail.map(d => FS.getDriverInvite(d.email).catch(() => null)));
  const linked = driversWithEmail
    .map((d, i) => ({ driver: d, invite: invites[i] }))
    .filter(x => x.invite && x.invite.driverUid);

  const current = sel.value;
  sel.innerHTML = '<option value="">Don\'t assign — I\'ll drive it / decide later</option>' +
    linked.map(x => `<option value="${x.invite.driverUid}" data-name="${TFP.esc(x.driver.name)}">${TFP.esc(x.driver.name)} (${TFP.esc(x.driver.license)})</option>`).join('');
  if ([...sel.options].some(o => o.value === current)) sel.value = current;

  // custom-select.js built this dropdown's visible UI from whatever options
  // existed at page load — refresh it now that the option list changed.
  if (window.refreshCustomSelect) refreshCustomSelect(sel);
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
  const tdsAmount = Math.round((wizard.total * (wizard.tdsRate || 0)) / 100);
  const gstAmount = Math.round((wizard.total * (wizard.gstRate || 0)) / 100);
  const netTotal = wizard.total - tdsAmount + gstAmount;
  const balance = netTotal - wizard.advance;

  const assignSelect = document.getElementById('trip-assign-driver');
  const assignedDriverUid = assignSelect.value || null;
  const assignedDriverName = assignedDriverUid ? assignSelect.selectedOptions[0].dataset.name : null;

  let trip;
  try {
    trip = await FS.add(uid, 'trips', {
      vehicleId: wizard.vehicleId,
      vehicleNumber: wizard.vehicleNumber,
      vehicleType: wizard.vehicleType,
      from: wizard.from,
      to: wizard.to,
      cycleOrigin: wizard.cycleOrigin || wizard.from,
      originalTotal: wizard.total,
      tdsPercent: wizard.tdsRate || 0,
      tdsAmount,
      gstType: wizard.gstType || 'NILL',
      gstPercent: wizard.gstRate || 0,
      gstAmount,
      total: netTotal,
      advance: wizard.advance,
      balance,
      paid: false,
      paidAt: null,
      fuelExpense: 0,
      tollExpense: 0,
      driverExpense: 0,
      cargoInfo: document.getElementById('trip-cargo-info').value.trim(),
      partyName: document.getElementById('trip-party-name').value.trim(),
      partyPhone: document.getElementById('trip-party-phone').value.trim(),
      assignedDriverUid,
      assignedDriverName,
      driverStatus: assignedDriverUid ? 'Assigned' : null,
      driverStatusUpdatedAt: null,
      registeredAt: dateInputToISOString(document.getElementById('trip-date').value)
    });
  } catch (err) {
    showToast(err.message || 'Could not register this trip.', 'error');
    return;
  }

  if (assignedDriverUid) await FS.addNotification(uid, `Trip assigned to ${assignedDriverName}: ${wizard.from} → ${wizard.to}`);

  currentTrips.push(trip);

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
      const card = document.createElement('div');
      card.className = 'trip-card';
      card.style.cursor = 'pointer';
      card.onclick = () => location.href = `trip-detail.html?id=${t.id}`;
      card.innerHTML = `
        <div class="tc-num">${cycleNum}</div>
        <div class="tc-main">
          <div class="tc-route">📍 ${t.from} → ${t.to}</div>
          <div class="tc-vehicle">🚛 ${t.vehicleNumber} · ${t.vehicleType}${t.assignedDriverUid ? ` · 🧑‍✈️ ${t.assignedDriverName} (${t.driverStatus || 'Assigned'})` : ''}</div>
        </div>
        <div class="tc-right">
          <div class="tc-amount">₹${t.total.toLocaleString('en-IN')}</div>
          <div class="tc-balance ${isPaid ? 'settled' : 'pending'}">
            ${isPaid ? '✅ Paid' : `⏳ ₹${balance.toLocaleString('en-IN')} due`}
          </div>
          <div class="tc-date">${new Date(t.registeredAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
        </div>
        <div class="row-menu" onclick="event.stopPropagation()">
          <button class="row-menu-btn" onclick="toggleRowMenu(this, event)" title="Actions">⋮</button>
          <div class="row-menu-dropdown">
            <button class="row-menu-item" onclick="location.href='trip-detail.html?id=${t.id}'">✏️ Edit</button>
            <button class="row-menu-item row-menu-danger" onclick="deleteTrip('${t.id}')">🗑️ Delete</button>
          </div>
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
  document.getElementById('broker-date').value = todayDateInputValue();
  
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

  // On phones the step strip scrolls horizontally — keep the active circle in view
  const activeStep = document.getElementById(`bws-${step}`);
  if (activeStep) activeStep.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  
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
  let trip;
  try {
    trip = await FS.add(uid, 'brokerTrips', {
      company: bwizard.company,
      owner: bwizard.owner,
      vehicleNumber: bwizard.vehicleNumber,
      from: bwizard.from,
      to: bwizard.to,
      purchase: bwizard.purchase,
      sell: bwizard.sell,
      date: dateInputToISOString(document.getElementById('broker-date').value)
    });
  } catch (err) {
    showToast(err.message || 'Could not register this brokered trip.', 'error');
    return;
  }

  currentBrokerTrips.push(trip);
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
      <div class="row-menu" onclick="event.stopPropagation()">
        <button class="row-menu-btn" onclick="toggleRowMenu(this, event)" title="Actions">⋮</button>
        <div class="row-menu-dropdown">
          <button class="row-menu-item" onclick="location.href='brokered-detail.html?id=${t.id}'">✏️ Edit</button>
          <button class="row-menu-item row-menu-danger" onclick="deleteBrokerTrip('${t.id}')">🗑️ Delete</button>
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
  
  // 1. Delete all of this account's Firestore data (subcollections, then the
  //    profile doc itself), then delete the Firebase Auth account.
  try {
    const subcollections = ['vehicles', 'drivers', 'trips', 'brokerTrips', 'notifications'];
    for (const name of subcollections) {
      const snap = await FS.col(uid, name).get();
      const batch = FS.db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    await FS.userDoc(uid).delete();
    await FS.auth.currentUser.delete();
  } catch (err) {
    if (err.code === 'auth/requires-recent-login') {
      showToast('Please sign in again, then retry deleting your account.', 'error');
      await FS.signOut();
      location.href = 'index.html';
      return;
    }
    showToast(err.message || 'Could not delete your account.', 'error');
    return;
  }

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
  await FS.signOut();

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
  if (type === 'change-role')     renderRoleView();
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
  ['account-details','change-role','appearance','notifications','help','delete-account','salary'].forEach(t => closeSubModal(t));
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
  const driver = currentDrivers.find(d => d.id === driverId);
  document.getElementById('salary-driver-id').value = driverId;
  document.getElementById('salary-driver-name').textContent = `Driver: ${driverName}`;
  // Prefilling with whatever's already on record turns this into an edit
  // instead of always starting blank — re-searching the same driver (or
  // clicking the ✏️ on their status card) now shows their current amount.
  document.getElementById('salary-amount').value = (driver && driver.lastSalary) || '';
  openSubModal('salary');
}

async function handleSaveSalary(e) {
  e.preventDefault();
  const driverId = document.getElementById('salary-driver-id').value;
  const amount = document.getElementById('salary-amount').value;
  
  if (!driverId || !amount) return;

  const salaryData = { lastSalary: Number(amount), lastSalaryDate: new Date().toISOString(), isSalaryPaid: false };
  try {
    await FS.update(uid, 'drivers', driverId, salaryData);
  } catch (err) {
    showToast(err.message || 'Could not save this salary.', 'error');
    return;
  }

  const idx = currentDrivers.findIndex(d => d.id === driverId);
  if (idx > -1) Object.assign(currentDrivers[idx], salaryData);

  closeSubModal('salary');
  showToast(`Salary of ₹${amount} saved for ${currentDrivers[idx] ? currentDrivers[idx].name : 'Driver'}!`, 'success');
  
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
  const count = document.getElementById('stw-count');
  if (count) count.textContent = `${drivers.length} salar${drivers.length !== 1 ? 'ies' : 'y'} assigned`;

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
        <div class="sd-status-group">
          <div class="salary-status-amount">₹${d.lastSalary}</div>
          <button class="btn-del btn-edit-row" onclick="openSalaryModal('${d.id}', '${d.name.replace(/'/g, "\\'")}')" title="Edit Salary">✏️</button>
          <label class="ss-checkbox-wrap">
            <input type="checkbox" class="ss-checkbox" ${isPaid ? 'checked' : ''} onclick="toggleSalaryPaid('${d.id}')">
            <span class="ss-check-label">${isPaid ? 'Paid' : 'Pending'}</span>
          </label>
        </div>
      </div>
    `;
  }).join('');
}

/* ── Export every driver with an assigned salary (one row each) to a real
   .xlsx file. Driving License is forced to a text cell so Excel can't
   mangle an all-numeric license into a number. ── */
function exportSalaryToExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel export library failed to load. Check your connection and try again.', 'error');
    return;
  }
  const drivers = getDrivers().filter(d => d.lastSalary).sort((a, b) => a.name.localeCompare(b.name));
  if (drivers.length === 0) {
    showToast('No salaries to export.', 'error');
    return;
  }

  const rows = drivers.map((d, i) => ({
    'S.No': i + 1,
    'Driver Name': d.name,
    'Driving License': d.license,
    'Salary Amount (₹)': d.lastSalary,
    'Salary Date': d.lastSalaryDate ? new Date(d.lastSalaryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A',
    'Payment Status': d.isSalaryPaid ? 'Paid' : 'Pending'
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref']);
  const licenseCol = 2; // 0-based: "Driving License" is the 3rd column
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: licenseCol });
    if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; }
  }
  ws['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Salary');
  XLSX.writeFile(wb, `TruckFleet-Salary-${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast(`Exported ${drivers.length} salar${drivers.length !== 1 ? 'ies' : 'y'} to Excel.`, 'success');
}

async function handleSalaryImportFile(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  await importSalaryFromExcel(file);
}

/* ── Import salary records from an .xlsx file. Matches each row to an
   EXISTING driver by Driving License (this never creates a new driver) and
   overwrites their salary amount / date / paid status. ── */
async function importSalaryFromExcel(file) {
  let rows;
  try {
    rows = await readExcelFile(file);
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }
  if (rows.length === 0) {
    showToast('That file has no rows to import.', 'error');
    return;
  }

  let updated = 0, notFound = 0, invalid = 0;

  for (const row of rows) {
    const license = String(findColumn(row, ['driving license', 'license']) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rawAmount = findColumn(row, ['salary amount (₹)', 'salary amount', 'amount']);
    const amount = Number(rawAmount);
    const rawStatus = findColumn(row, ['payment status', 'status']);

    if (!license || !rawAmount || isNaN(amount) || amount < 0) { invalid++; continue; }

    const driver = currentDrivers.find(d => d.license === license);
    if (!driver) { notFound++; continue; }

    const isPaid = String(rawStatus || '').trim().toLowerCase() === 'paid';
    const salaryData = { lastSalary: amount, lastSalaryDate: new Date().toISOString(), isSalaryPaid: isPaid };
    try {
      await FS.update(uid, 'drivers', driver.id, salaryData);
      Object.assign(driver, salaryData);
      updated++;
    } catch (err) {
      invalid++;
    }
  }

  renderSalaryStatus();

  const parts = [];
  if (updated) parts.push(`${updated} updated`);
  if (notFound) parts.push(`${notFound} driver${notFound !== 1 ? 's' : ''} not found`);
  if (invalid) parts.push(`${invalid} row${invalid !== 1 ? 's' : ''} invalid`);
  showToast(summarizeImport(parts, 'imported'), updated > 0 ? 'success' : 'error');
}

async function toggleSalaryPaid(driverId) {
  const driver = currentDrivers.find(d => d.id === driverId);
  if (!driver) return;

  const nextPaid = !driver.isSalaryPaid;
  try {
    await FS.update(uid, 'drivers', driverId, { isSalaryPaid: nextPaid });
  } catch (err) {
    showToast(err.message || 'Could not update salary status.', 'error');
    renderSalaryStatus(); // revert the checkbox's optimistic UI state
    return;
  }
  driver.isSalaryPaid = nextPaid;

  const card = document.getElementById(`statcard-${driverId}`);
  if (card) {
    // Add a quick animation effect before re-rendering
    card.style.transform = 'scale(0.95)';
    card.style.opacity = '0.5';

    // Wait for the visual effect, then re-render the list to sort it
    setTimeout(() => {
      renderSalaryStatus();
      if (driver.isSalaryPaid) {
         showToast(`Marked as paid for ${driver.name}`, 'success');
      } else {
         showToast(`Marked as pending for ${driver.name}`, 'info');
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

