# TruckFleet Pro — Backend

A real multi-user backend: every account's vehicles, drivers, trips and
brokered trips live in a shared SQLite database on this server, not in each
visitor's browser. Anyone who signs up gets their own account; nobody can see
or modify another account's data.

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to a random value:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Twilio settings are optional — leave the placeholder values and OTPs will be
printed to the server console and shown on-screen in the browser instead of
sent by SMS (useful for local development).

## Running

```bash
npm start          # node server.js
npm run dev        # same, but restarts on file changes (node --watch)
```

The server listens on `PORT` (default `3000`) and serves both the API and
the static frontend (the parent folder), so opening
`http://localhost:3000/` in a browser gets you the whole app — no separate
frontend server needed.

## Data

- `truckfleet.db` (created automatically on first run, in this folder) — the
  SQLite database. It's gitignored; don't commit it. Delete it to start with
  a completely empty database (all accounts, vehicles, trips, etc. are lost).
- Tables: `users`, `vehicles`, `drivers`, `trips`, `broker_trips`,
  `notifications` — see `db.js` for the schema. Every table except `users`
  has a `user_id` foreign key with `ON DELETE CASCADE`, so deleting an
  account cleans up all of its data automatically.
- Passwords are hashed with bcrypt (`auth.js`) — never stored in plain text.

## Authentication

Sign up / sign in return a JWT (`token`). The frontend stores it in
`localStorage` ("Remember me") or `sessionStorage` and sends it as
`Authorization: Bearer <token>` on every API request — see `TFP.api()` in
`../site-config.js`. Tokens are valid for 30 days. `auth.js`'s
`requireAuth` middleware verifies the token and attaches `req.userId`;
every route scopes its database queries to that ID.

## API surface

All routes below except `/api/auth/signup`, `/api/auth/login`,
`/api/auth/check-phone/:phone`, `/api/auth/reset-password`,
`/api/send-otp` and `/api/verify-otp` require the `Authorization` header.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create an account, returns `{token, user}` |
| POST | `/api/auth/login` | `{token, user}` |
| GET | `/api/auth/me` | Current user's profile |
| PATCH | `/api/auth/role` | Change role |
| POST | `/api/auth/change-password` | Change password (requires current password) |
| GET | `/api/auth/check-phone/:phone` | `{exists}` — used by the forgot-password flow |
| POST | `/api/auth/reset-password` | Reset password by phone (after OTP verification) |
| DELETE | `/api/auth/account` | Delete the account and all of its data |
| GET/POST | `/api/vehicles` | List / add vehicles |
| DELETE | `/api/vehicles/:id` | Remove a vehicle |
| GET/POST | `/api/drivers` | List / add drivers |
| DELETE | `/api/drivers/:id` | Remove a driver |
| PATCH | `/api/drivers/:id/salary` | Assign this month's salary |
| PATCH | `/api/drivers/:id/salary-status` | Toggle paid/pending |
| GET/POST | `/api/trips` | List / register trips (server computes TDS/GST/balance) |
| GET | `/api/trips/:id` | One trip |
| PATCH | `/api/trips/:id/advance` | Live-edit advance paid |
| PATCH | `/api/trips/:id/expenses` | Live-edit fuel/toll/driver expenses |
| POST | `/api/trips/:id/mark-paid` | Settle the balance |
| GET/POST | `/api/broker-trips` | List / add brokered trips |
| GET | `/api/broker-trips/:id` | One brokered trip |
| GET | `/api/notifications` | Most recent 25 notifications |
| POST | `/api/send-otp` / `/api/verify-otp` | Phone OTP (Twilio or console/demo fallback) |

## Project layout

```
backend/
  server.js       — Express app, mounts routes, serves the static frontend
  db.js           — SQLite connection + schema (creates tables if missing)
  auth.js         — password hashing, JWT signing/verification, requireAuth middleware
  serialize.js    — DB row → camelCase JSON (what the frontend expects)
  notify.js       — creates notifications, trims history to 25 per user
  routes/
    auth.js
    vehicles.js
    drivers.js
    trips.js
    brokerTrips.js
    notifications.js
```
