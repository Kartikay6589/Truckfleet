/* ════════════════════════════════════════════
   TRUCKFLEET PRO — firebase-init.js
   Initializes Firebase (Auth + Firestore) and exposes a small set of
   globals every other script uses. Uses the "compat" SDK (not the modular
   v9+ API) so it works with plain <script> tags — no bundler, no ES modules
   — matching the rest of this codebase's style.
════════════════════════════════════════════ */

// Safe to keep public: a Firebase web app's config is not a secret. Access
// control is enforced server-side by Firestore Security Rules (see
// firestore.rules), not by hiding this object.
const firebaseConfig = {
  apiKey: "AIzaSyBZG5McUdooojTGSaiiQ0AZZpPPq12Pk6w",
  authDomain: "truckfleet-1cc02.firebaseapp.com",
  projectId: "truckfleet-1cc02",
  storageBucket: "truckfleet-1cc02.firebasestorage.app",
  messagingSenderId: "822879593554",
  appId: "1:822879593554:web:c6784ff9eb79f888d6ab8b",
  measurementId: "G-E4JQY5JWC6"
};

firebase.initializeApp(firebaseConfig);

const fbAuth = firebase.auth();
const fbDb = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// The one account that can approve/deny new Fleet Owner & Company signups —
// see firestore.rules for how this same address gates the "approved" field
// server-side (a hardcoded check here is only ever a UI convenience, never
// the actual security boundary).
const ADMIN_EMAIL = 'adminapproval01@gmail.com';

/* ════════════════════════════════════════════
   FS — small Firestore/Auth helper layer.
   Every account's data lives under users/{uid}/... so Firestore Security
   Rules can enforce "you only ever touch your own documents" in one place.
════════════════════════════════════════════ */
window.FS = {
  auth: fbAuth,
  db: fbDb,

  /* Resolves once Firebase has checked localStorage/IndexedDB for an
     existing session. Every page's boot code awaits this before deciding
     whether to redirect to the sign-in page. */
  waitForUser() {
    return new Promise((resolve) => {
      const unsub = fbAuth.onAuthStateChanged((user) => { unsub(); resolve(user); });
    });
  },

  /* role is only meaningful the first time this account signs in — an
     existing account keeps whatever role it already has (see
     ensureUserProfile). */
  async signInWithGoogle(role) {
    await fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const result = await fbAuth.signInWithPopup(googleProvider);
    await this.ensureUserProfile(result.user, role);
    return result.user;
  },

  /* Email/password sign-up. Creates the Firebase Auth account and the
     Firestore profile document together — if either step fails, script.js
     shows the error and the user can just try again. */
  async signUpWithEmail({ firstName, lastName, email, password, role }) {
    const cred = await fbAuth.createUserWithEmailAndPassword(email, password);
    const user = cred.user;
    try { await user.updateProfile({ displayName: `${firstName} ${lastName}`.trim() }); } catch (e) {}
    const isAdmin = email.trim().toLowerCase() === ADMIN_EMAIL;
    const finalRole = isAdmin ? 'admin' : this.normalizeRole(role);
    const profile = {
      firstName, lastName, email, phone: '', photoURL: '',
      role: finalRole, createdAt: new Date().toISOString(),
      // New Fleet Owner / Company accounts wait for the admin to approve
      // them before they can use the app — see dashboard.js's boot check.
      // Admin and driver accounts (drivers are already invite-linked by an
      // approved owner) never need this gate.
      approved: (finalRole === 'fleet-owner' || finalRole === 'company') ? false : true
    };
    await this.userDoc(user.uid).set(profile);
    return user;
  },

  normalizeRole(role) {
    return ['fleet-owner', 'company', 'driver'].includes(role) ? role : 'fleet-owner';
  },

  /* Email/password sign-in. "Remember me" unchecked → session-only
     (cleared when the browser closes) instead of persisting indefinitely. */
  async signInWithEmail(email, password, remember = true) {
    await fbAuth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    const cred = await fbAuth.signInWithEmailAndPassword(email, password);
    const profile = await this.ensureUserProfile(cred.user);
    return {
      uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName,
      firstName: profile.firstName, lastName: profile.lastName
    };
  },

  async sendPasswordReset(email) {
    await fbAuth.sendPasswordResetEmail(email);
  },

  async signOut() {
    await fbAuth.signOut();
  },

  userDoc(uid) {
    return fbDb.collection('users').doc(uid);
  },

  /* ── Driver <-> Fleet Owner linking ──
     A Fleet Owner creates one of these (keyed by the driver's email) when
     adding a driver with an email address. When that person eventually
     signs up or signs in with role "driver", driver.js looks this up by
     their own email and claims it — that's the only way a driver account
     ever gets access to a specific owner's trips (see firestore.rules). */
  driverInviteDoc(email) {
    return fbDb.collection('driverInvites').doc(email.trim().toLowerCase());
  },

  async createDriverInvite(email, ownerUid, driverId) {
    await this.driverInviteDoc(email).set({
      ownerUid, driverId, driverUid: null, createdAt: new Date().toISOString()
    });
  },

  async getDriverInvite(email) {
    const snap = await this.driverInviteDoc(email).get();
    return snap.exists ? snap.data() : null;
  },

  async claimDriverInvite(email, driverUid) {
    await this.driverInviteDoc(email).update({ driverUid });
  },

  /* Creates the users/{uid} profile document the first time someone signs
     in; leaves it alone on every later sign-in. */
  async ensureUserProfile(user, role) {
    const ref = this.userDoc(user.uid);
    const snap = await ref.get();
    if (snap.exists) return snap.data();

    const [firstName, ...rest] = (user.displayName || 'New User').split(' ');
    const isAdmin = (user.email || '').trim().toLowerCase() === ADMIN_EMAIL;
    const finalRole = isAdmin ? 'admin' : this.normalizeRole(role);
    const profile = {
      firstName: firstName || 'New',
      lastName: rest.join(' ') || 'User',
      email: user.email || '',
      phone: user.phoneNumber || '',
      photoURL: user.photoURL || '',
      role: finalRole,
      createdAt: new Date().toISOString(),
      approved: (finalRole === 'fleet-owner' || finalRole === 'company') ? false : true
    };
    await ref.set(profile);
    return profile;
  },

  async getUserProfile(uid) {
    const snap = await this.userDoc(uid).get();
    return snap.exists ? snap.data() : null;
  },

  /* ── Admin: approving new Fleet Owner / Company signups ──
     Only the ADMIN_EMAIL account can actually read across every user's
     profile or write the "approved"/"denied" fields — enforced by
     firestore.rules, not by this file. See admin.js for the UI. */
  async getPendingAccounts() {
    const snap = await fbDb.collection('users').where('approved', '==', false).get();
    // A denied account also has approved:false (it never becomes true), so
    // it would otherwise sit in this list forever looking "pending" again —
    // filter those out here since Firestore can't do a "!= true" filter
    // alongside an "== false" one without a composite index.
    return snap.docs.map(this.docToObj).filter(u => !u.denied);
  },

  async approveAccount(targetUid) {
    await this.userDoc(targetUid).update({ approved: true, denied: false });
  },

  async denyAccount(targetUid) {
    await this.userDoc(targetUid).update({ approved: false, denied: true });
  },

  /* Every account except the admin's own — the "All Users" list in
     admin.js. Sorted newest-first so freshly created accounts surface
     at the top, same as every other list in this app. */
  async getAllAccounts() {
    const snap = await fbDb.collection('users').get();
    return snap.docs.map(this.docToObj)
      .filter(u => u.role !== 'admin')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  },

  // Every subcollection an account's data can live in — kept in one place
  // so deleteAccount (below) and anything else that needs to wipe an
  // account clean stays in sync with what the rest of the app actually
  // writes to.
  ACCOUNT_SUBCOLLECTIONS: ['vehicles', 'drivers', 'parties', 'banks', 'trips', 'brokerTrips', 'notifications'],

  /* Admin-only: permanently removes an account's Firestore data (profile +
     every subcollection above). This does NOT delete their Firebase Auth
     login — that requires the Admin SDK, which this client-only app
     doesn't have — so if they sign in again afterwards they'll land back
     on a fresh, unapproved account rather than being locked out entirely.
     Trip-level sub-subcollections (expenses/issues/podSubmissions) are
     left behind as orphaned data; not worth a second round of queries for
     records nobody can reach once the parent trip is gone. */
  async deleteAccount(targetUid) {
    for (const name of this.ACCOUNT_SUBCOLLECTIONS) {
      const snap = await fbDb.collection('users').doc(targetUid).collection(name).get();
      if (snap.empty) continue;
      const batch = fbDb.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    await this.userDoc(targetUid).delete();
  },

  /* A user's own subcollection, e.g. FS.col(uid, 'vehicles') */
  col(uid, name) {
    return this.userDoc(uid).collection(name);
  },

  // Turns a Firestore doc snapshot into a plain {id, ...fields} object —
  // every render function in this app expects that shape.
  docToObj(doc) {
    return Object.assign({ id: doc.id }, doc.data());
  },

  async getAll(uid, collectionName, orderByField) {
    let q = this.col(uid, collectionName);
    if (orderByField) q = q.orderBy(orderByField);
    const snap = await q.get();
    return snap.docs.map(this.docToObj);
  },

  async add(uid, collectionName, data) {
    const ref = await this.col(uid, collectionName).add(data);
    return Object.assign({ id: ref.id }, data);
  },

  async update(uid, collectionName, id, data) {
    await this.col(uid, collectionName).doc(id).update(data);
  },

  async remove(uid, collectionName, id) {
    await this.col(uid, collectionName).doc(id).delete();
  },

  async addNotification(uid, message) {
    await this.add(uid, 'notifications', { message, time: new Date().toISOString() });
    // Trim to the most recent 25 so the collection doesn't grow forever.
    const all = await this.getAll(uid, 'notifications', 'time');
    const excess = all.length - 25;
    if (excess > 0) {
      const batch = fbDb.batch();
      all.slice(0, excess).forEach(n => batch.delete(this.col(uid, 'notifications').doc(n.id)));
      await batch.commit();
    }
  }
};
