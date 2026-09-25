const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const S = require('../serialize');
const { hashPassword, checkPassword, signToken, requireAuth } = require('../auth');

const router = express.Router();
const genId = () => crypto.randomUUID();

const ALLOWED_ROLES = ['fleet-owner', 'company', 'driver'];
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/* ── Sign up ── */
router.post('/signup', (req, res) => {
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

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').get(email, phone);
  if (existing) return res.status(409).json({ success: false, message: 'An account with that email or phone number already exists.' });

  const id = genId();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (id, first_name, last_name, email, phone, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, firstName, lastName, email, phone, hashPassword(password), role, now);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json({ success: true, token: signToken(id), user: S.user(row) });
});

/* ── Sign in ── */
router.post('/login', (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row) return res.status(404).json({ success: false, message: 'Account not found. Please sign up.' });
  if (!checkPassword(password, row.password_hash)) {
    return res.status(401).json({ success: false, message: 'Incorrect password.' });
  }

  res.json({ success: true, token: signToken(row.id), user: S.user(row) });
});

/* ── Current user ── */
router.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Account no longer exists.' });
  res.json({ success: true, user: S.user(row) });
});

/* ── Change role ── */
router.patch('/role', requireAuth, (req, res) => {
  const role = req.body?.role;
  if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ success: false, message: 'Please select a valid role.' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.userId);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ success: true, user: S.user(row) });
});

/* ── Change password ── */
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Account no longer exists.' });
  if (!checkPassword(currentPassword || '', row.password_hash)) {
    return res.status(401).json({ success: false, message: 'Incorrect current password.' });
  }
  if (!newPassword || newPassword.length < 10 || !/[A-Z]/.test(newPassword)) {
    return res.status(400).json({ success: false, message: 'Password must be at least 10 characters long and contain at least one uppercase letter.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.userId);
  res.json({ success: true });
});

/* ── Does an account exist for this phone? (forgot-password step 1 UX) ── */
router.get('/check-phone/:phone', (req, res) => {
  const row = db.prepare('SELECT id FROM users WHERE phone = ?').get(req.params.phone);
  res.json({ success: true, exists: !!row });
});

/* ── Forgot password (via phone OTP, verified separately by /api/verify-otp) ── */
router.post('/reset-password', (req, res) => {
  const phone = (req.body?.phone || '').trim();
  const newPassword = req.body?.newPassword || '';
  const row = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!row) return res.status(404).json({ success: false, message: 'No account found with that phone number.' });
  if (newPassword.length < 10 || !/[A-Z]/.test(newPassword)) {
    return res.status(400).json({ success: false, message: 'Password must be at least 10 characters long and contain at least one uppercase letter.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), row.id);
  res.json({ success: true });
});

/* ── Delete account (cascades vehicles/drivers/trips/broker trips/notifications) ── */
router.delete('/account', requireAuth, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
  res.json({ success: true });
});

module.exports = router;
