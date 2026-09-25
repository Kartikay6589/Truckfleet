# TruckFleet Pro — Backend

A real multi-user backend: every account's vehicles, drivers, trips and
brokered trips live in a shared **Supabase (Postgres) database**, not in
each visitor's browser. Anyone who signs up gets their own account; nobody
can see or modify another account's data.

Deployment shape: **frontend on Vercel, backend on Render, database on
Supabase** — three separate services, each doing one job.

## Setup (local development)

```bash
cd backend
npm install
cp .env.example .env
```

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) → New Project (free tier is
fine). Once it's created, go to **Project Settings → Database → Connection
string → URI**, copy it, and paste it into `.env` as `DATABASE_URL`
(fill in the password you set when creating the project).

### 2. Generate a JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste the output into `.env` as `JWT_SECRET`.

Twilio settings are optional — leave the placeholder values and OTPs will be
printed to the server console and shown on-screen in the browser instead of
sent by SMS (useful for local development).

## Running locally

```bash
npm start          # node server.js
npm run dev        # same, but restarts on file changes (node --watch)
```

The server listens on `PORT` (default `3000`) and serves both the API and
the static frontend (the parent folder), so opening
`http://localhost:3000/` in a browser gets you the whole app for local
testing — no separate frontend server needed. In production, the frontend
is deployed separately (see below).

## Deploying

**Database — Supabase:** already hosted once you created the project above.
Tables are created automatically the first time the server connects (see
`db.js`) — no manual migration step needed.

**Backend — Render:**
1. Push this repo to GitHub.
2. On [render.com](https://render.com), New → Web Service → connect the repo
   (or use the included `render.yaml` as a Blueprint for one-click setup).
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables: `DATABASE_URL`, `JWT_SECRET`, and once you know
   your Vercel URL, `CORS_ORIGIN` (set it to that URL so the browser is
   allowed to call this API cross-origin).
5. Deploy — Render gives you a URL like `https://your-app.onrender.com`.

**Frontend — Vercel:**
1. On [vercel.com](https://vercel.com), New Project → import the same repo.
   `vercel.json` at the repo root tells Vercel this is a static site (the
   backend is deployed separately, so `.vercelignore` excludes it here).
2. Before deploying, open `../site-config.js` and replace
   `https://YOUR-BACKEND-NAME.onrender.com` with your actual Render URL from
   the step above, then commit and push — Vercel redeploys automatically.
3. Deploy — Vercel gives you a URL like `https://your-app.vercel.app`. Set
   that as `CORS_ORIGIN` on Render (step above) if you haven't yet.

## Data

- Tables: `users`, `vehicles`, `drivers`, `trips`, `broker_trips`,
  `notifications` — see `db.js` for the schema. Every table except `users`
  has a `user_id` foreign key with `ON DELETE CASCADE`, so deleting an
  account cleans up all of its data automatically.
- Passwords are hashed with bcrypt (`auth.js`) — never stored in plain text.
- Browse/query the data directly in Supabase's dashboard under **Table
  Editor**, or **SQL Editor** for custom queries — no separate DB client
  needed.

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
  server.js       — Express app, mounts routes, serves the static frontend (local dev)
  db.js           — Postgres connection pool + schema (creates tables if missing)
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
