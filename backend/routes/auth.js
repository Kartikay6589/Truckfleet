const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const S = require('../serialize');
const { hashPassword, checkPassword, signToken, requireAuth } = require('../auth');

const router = express.Router();
const genId = () => crypto.randomUUID();

const ALLOWED_ROLES = ['fleet-owner', 'company', 'driver'];
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PG_UNIQUE_VIOLATION = '23505';

/* ── Sign up ── */
router.post('/signup', async (req, res) => {
  let { firstName, lastName, email, phone, password, role } = req.body || {};
  firstName = (firstName || '').trim();
  lastName = (lastName || '').trim();
  email = (email || '').trim().toLowerCase();
  phone = (phone || '').trim();

  if (!firstName || !lastName) return res.status(400).json({ success: false, message: 'First and last name are required.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  if (!/^\d{10}$/.test(phone)) return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits.' });
  if (!password || password.length < 10 || !/[A-Z]/.test(password)) {
    return res.status(400).json({ success: false, message: 'Password must be at least 10 characters long and contain at least one uppercase letter.' });
  }
  if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ success: false, message: 'Please select a valid role.' });

  const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1 OR phone = $2', [email, phone]);
  if (existing.length) return res.status(409).json({ success: false, message: 'An account with that email or phone number already exists.' });

  const id = genId();
  const now = new Date().toISOString();
  try {
    await db.query(`
      INSERT INTO users (id, first_name, last_name, email, phone, password_hash, role, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, firstName, lastName, email, phone, hashPassword(password), role, now]);
  } catch (err) {
    if (err.code === PG_UNIQUE_VIOLATION) {
      return res.status(409).json({ success: false, message: 'An account with that email or phone number already exists.' });
    }
    throw err;
  }

  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  res.status(201).json({ success: true, token: signToken(id), user: S.user(rows[0]) });
});

/* ── Sign in ── */
router.post('/login', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';

  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const row = rows[0];
  if (!row) return res.status(404).json({ success: false, message: 'Account not found. Please sign up.' });
  if (!checkPassword(password, row.password_hash)) {
    return res.status(401).json({ success: false, message: 'Incorrect password.' });
  }

  res.json({ success: true, token: signToken(row.id), user: S.user(row) });
});

/* ── Current user ── */
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Account no longer exists.' });
  res.json({ success: true, user: S.user(rows[0]) });
});

/* ── Change role ── */
router.patch('/role', requireAuth, async (req, res) => {
  const role = req.body?.role;
  if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ success: false, message: 'Please select a valid role.' });
  await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.userId]);
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  res.json({ success: true, user: S.user(rows[0]) });
});

/* ── Change password ── */
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.userId]);
  const row = rows[0];
  if (!row) return res.status(404).json({ success: false, message: 'Account no longer exists.' });
  if (!checkPassword(currentPassword || '', row.password_hash)) {
    return res.status(401).json({ success: false, message: 'Incorrect current password.' });
  }
  if (!newPassword || newPassword.length < 10 || !/[A-Z]/.test(newPassword)) {
    return res.status(400).json({ success: false, message: 'Password must be at least 10 characters long and contain at least one uppercase letter.' });
  }
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(newPassword), req.userId]);
  res.json({ success: true });
});

/* ── Does an account exist for this phone? (forgot-password step 1 UX) ── */
router.get('/check-phone/:phone', async (req, res) => {
  const { rows } = await db.query('SELECT id FROM users WHERE phone = $1', [req.params.phone]);
  res.json({ success: true, exists: rows.length > 0 });
});

/* ── Forgot password (via phone OTP, verified separately by /api/verify-otp) ── */
router.post('/reset-password', async (req, res) => {
  const phone = (req.body?.phone || '').trim();
  const newPassword = req.body?.newPassword || '';
  const { rows } = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
  const row = rows[0];
  if (!row) return res.status(404).json({ success: false, message: 'No account found with that phone number.' });
  if (newPassword.length < 10 || !/[A-Z]/.test(newPassword)) {
    return res.status(400).json({ success: false, message: 'Password must be at least 10 characters long and contain at least one uppercase letter.' });
  }
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(newPassword), row.id]);
  res.json({ success: true });
});

/* ── Delete account (cascades vehicles/drivers/trips/broker trips/notifications) ── */
router.delete('/account', requireAuth, async (req, res) => {
  await db.query('DELETE FROM users WHERE id = $1', [req.userId]);
  res.json({ success: true });
});

module.exports = router;
