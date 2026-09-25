/* ════════════════════════════════════════════
   TRUCKFLEET PRO — database layer
   Postgres (Supabase). Every table (except users) carries a user_id so
   each account only ever sees its own data.
════════════════════════════════════════════ */
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set in backend/.env — copy your connection string ' +
    'from Supabase (Project Settings → Database → Connection string → URI) and add it.'
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase requires SSL; its certificate isn't in Node's default trust
  // store, so this trusts it without pinning the cert chain (fine for this
  // app — the connection is still encrypted, just not certificate-verified).
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err);
});

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    phone         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'fleet-owner',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_number TEXT NOT NULL,
    owner_name     TEXT NOT NULL,
    driver_name    TEXT,
    vehicle_type   TEXT NOT NULL,
    added_at       TEXT NOT NULL,
    UNIQUE(user_id, vehicle_number)
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    license          TEXT NOT NULL,
    last_salary      DOUBLE PRECISION,
    last_salary_date TEXT,
    is_salary_paid   BOOLEAN NOT NULL DEFAULT false,
    added_at         TEXT NOT NULL,
    UNIQUE(user_id, license)
  );

  CREATE TABLE IF NOT EXISTS trips (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id     TEXT,
    vehicle_number TEXT NOT NULL,
    vehicle_type   TEXT,
    from_loc       TEXT NOT NULL,
    to_loc         TEXT NOT NULL,
    cycle_origin   TEXT,
    original_total DOUBLE PRECISION NOT NULL,
    tds_percent    DOUBLE PRECISION NOT NULL DEFAULT 0,
    tds_amount     DOUBLE PRECISION NOT NULL DEFAULT 0,
    gst_type       TEXT NOT NULL DEFAULT 'NILL',
    gst_percent    DOUBLE PRECISION NOT NULL DEFAULT 0,
    gst_amount     DOUBLE PRECISION NOT NULL DEFAULT 0,
    total          DOUBLE PRECISION NOT NULL,
    advance        DOUBLE PRECISION NOT NULL DEFAULT 0,
    balance        DOUBLE PRECISION NOT NULL,
    paid           BOOLEAN NOT NULL DEFAULT false,
    paid_at        TEXT,
    fuel_expense   DOUBLE PRECISION NOT NULL DEFAULT 0,
    toll_expense   DOUBLE PRECISION NOT NULL DEFAULT 0,
    driver_expense DOUBLE PRECISION NOT NULL DEFAULT 0,
    registered_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS broker_trips (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company        TEXT NOT NULL,
    owner          TEXT NOT NULL,
    vehicle_number TEXT NOT NULL,
    from_loc       TEXT NOT NULL,
    to_loc         TEXT NOT NULL,
    purchase       DOUBLE PRECISION NOT NULL,
    sell           DOUBLE PRECISION NOT NULL,
    date           TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id      TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    time    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);
  CREATE INDEX IF NOT EXISTS idx_drivers_user  ON drivers(user_id);
  CREATE INDEX IF NOT EXISTS idx_trips_user    ON trips(user_id);
  CREATE INDEX IF NOT EXISTS idx_broker_user   ON broker_trips(user_id);
  CREATE INDEX IF NOT EXISTS idx_notif_user    ON notifications(user_id);
`;

// Runs once at boot; safe to run every time the server starts (IF NOT EXISTS).
let readyPromise = null;
function ready() {
  if (!readyPromise) readyPromise = pool.query(schema);
  return readyPromise;
}

module.exports = {
  pool,
  ready,
  query: (text, params) => pool.query(text, params)
};
