const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const S = require('../serialize');
const { requireAuth } = require('../auth');
const { addNotification } = require('../notify');

const router = express.Router();
router.use(requireAuth);
const genId = () => crypto.randomUUID();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM drivers WHERE user_id = ? ORDER BY added_at ASC').all(req.userId);
  res.json({ success: true, drivers: rows.map(S.driver) });
});

router.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  const license = (req.body?.license || '').trim().toUpperCase();

  if (!name) return res.status(400).json({ success: false, message: 'Driver name is required.' });
  if (!/^[A-Z0-9]+$/.test(license)) return res.status(400).json({ success: false, message: 'Driving license can only contain uppercase letters and numbers.' });

  const dupe = db.prepare('SELECT id FROM drivers WHERE user_id = ? AND license = ?').get(req.userId, license);
  if (dupe) return res.status(409).json({ success: false, message: 'This driving license is already registered.' });

  const id = genId();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO drivers (id, user_id, name, license, added_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.userId, name, license, now);

  addNotification(req.userId, `New driver added: ${name}`);
  res.status(201).json({ success: true, driver: S.driver(db.prepare('SELECT * FROM drivers WHERE id = ?').get(id)) });
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM drivers WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Driver not found.' });
  db.prepare('DELETE FROM drivers WHERE id = ?').run(req.params.id);
  addNotification(req.userId, `Driver removed: ${row.name}`);
  res.json({ success: true, driver: S.driver(row) });
});

/* Assign / update this month's salary figure */
router.patch('/:id/salary', (req, res) => {
  const row = db.prepare('SELECT * FROM drivers WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Driver not found.' });

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ success: false, message: 'Please enter a valid salary amount.' });

  db.prepare('UPDATE drivers SET last_salary = ?, last_salary_date = ?, is_salary_paid = 0 WHERE id = ?')
    .run(amount, new Date().toISOString(), req.params.id);
  res.json({ success: true, driver: S.driver(db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id)) });
});

/* Toggle paid/pending status for the assigned salary */
router.patch('/:id/salary-status', (req, res) => {
  const row = db.prepare('SELECT * FROM drivers WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Driver not found.' });

  const next = row.is_salary_paid ? 0 : 1;
  db.prepare('UPDATE drivers SET is_salary_paid = ? WHERE id = ?').run(next, req.params.id);
  res.json({ success: true, driver: S.driver(db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id)) });
});

module.exports = router;
