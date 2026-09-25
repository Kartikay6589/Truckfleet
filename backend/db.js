/* ════════════════════════════════════════════
   TRUCKFLEET PRO — database layer
   SQLite file, one row per real record. Every table (except users)
   carries a user_id so each account only ever sees its own data.
════════════════════════════════════════════ */
const path = require('path');
const Database = require('better-sqlite3');

// On most hosts, disk written outside a mounted volume is wiped on every
// redeploy. Set DB_PATH (e.g. to a mounted volume like /data/truckfleet.db)
// in production; it defaults to a file next to this script for local dev.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'truckfleet.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
    last_salary      REAL,
    last_salary_date TEXT,
    is_salary_paid   INTEGER NOT NULL DEFAULT 0,
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
    original_total REAL NOT NULL,
    tds_percent    REAL NOT NULL DEFAULT 0,
    tds_amount     REAL NOT NULL DEFAULT 0,
    gst_type       TEXT NOT NULL DEFAULT 'NILL',
    gst_percent    REAL NOT NULL DEFAULT 0,
    gst_amount     REAL NOT NULL DEFAULT 0,
    total          REAL NOT NULL,
    advance        REAL NOT NULL DEFAULT 0,
    balance        REAL NOT NULL,
    paid           INTEGER NOT NULL DEFAULT 0,
    paid_at        TEXT,
    fuel_expense   REAL NOT NULL DEFAULT 0,
    toll_expense   REAL NOT NULL DEFAULT 0,
    driver_expense REAL NOT NULL DEFAULT 0,
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
    purchase       REAL NOT NULL,
    sell           REAL NOT NULL,
    date           TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id      TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    time    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_vehicles_user   ON vehicles(user_id);
  CREATE INDEX IF NOT EXISTS idx_drivers_user    ON drivers(user_id);
  CREATE INDEX IF NOT EXISTS idx_trips_user      ON trips(user_id);
  CREATE INDEX IF NOT EXISTS idx_broker_user     ON broker_trips(user_id);
  CREATE INDEX IF NOT EXISTS idx_notif_user      ON notifications(user_id);
`);

module.exports = db;
