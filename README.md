# TruckFleet Pro

A fleet/logistics management app — track vehicles, drivers, trips (with
TDS/GST calculation), brokered loads, and driver salaries.

## Architecture

This is a **fully static site** — no backend server. It talks directly to
**Firebase** from the browser:

- **Auth**: Firebase Authentication, Google Sign-In only. No passwords to
  manage — signing in with your Google account *is* your account.
- **Database**: Firestore. Every signed-in user's data lives under
  `users/{their-uid}/...` (vehicles, drivers, trips, brokerTrips,
  notifications as subcollections) — see `firestore.rules` for how access is
  locked to each user's own data.
- **Hosting**: any static host works (Vercel, Firebase Hosting, Netlify...).
  There's nothing to build — it's plain HTML/CSS/JS.

## Local development

No install, no build step. Just open `index.html` in a browser, or serve the
folder with any static file server, e.g.:

```bash
npx serve .
```

## Firebase setup (one-time)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication** → Sign-in method → enable **Google**.
3. **Firestore Database** → create a database (production mode).
4. **Firestore → Rules** → paste in the contents of `firestore.rules` from
   this repo, and publish.
5. **Project settings → General → Your apps** → add a Web app (if you
   haven't already) → copy the `firebaseConfig` object → paste it into
   `firebase-init.js` in this repo, replacing the existing one.

That's it — no environment variables, no secrets to manage. A Firebase web
app's config (`apiKey`, etc.) is not sensitive; access control is enforced
by the Firestore rules above, not by hiding this config.

## Deploying

**Vercel** (or any static host):
1. Push this repo to GitHub.
2. Import it on [vercel.com](https://vercel.com) — `vercel.json` tells it
   this is a static site, so it deploys as-is with no build step.
3. Done — you get a public URL immediately.

**Firebase Hosting** is also a natural fit since you're already using
Firebase:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # public directory: . (repo root)
firebase deploy
```

## Data model (Firestore)

```
users/{uid}                      — profile: firstName, lastName, email, phone, role, createdAt
users/{uid}/vehicles/{id}        — vehicleNumber, ownerName, driverName, vehicleType, addedAt
users/{uid}/drivers/{id}         — name, license, lastSalary, lastSalaryDate, isSalaryPaid, addedAt
users/{uid}/trips/{id}           — from, to, total, advance, balance, tds/gst fields, paid, registeredAt...
users/{uid}/brokerTrips/{id}     — company, owner, vehicleNumber, from, to, purchase, sell, date
users/{uid}/notifications/{id}   — message, time (trimmed to the most recent 25)
```

Browse this data directly in the Firebase Console under **Firestore
Database → Data** — no separate DB client needed.

## Project layout

```
firebase-init.js   — Firebase app init + the FS helper (auth + Firestore CRUD) every page uses
firestore.rules    — per-user data isolation, paste into Firebase Console → Firestore → Rules
site-config.js     — support contact info + the Appearance (theme/accent) preferences engine
script.js          — landing page: Google sign-in, animations
dashboard.js       — the whole app: vehicles, drivers, trips, salary, brokered trips
trip-detail.js / brokered-detail.js — single-trip detail pages
```
