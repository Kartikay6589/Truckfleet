const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const S = require('../serialize');
const { requireAuth } = require('../auth');
const { addNotification } = require('../notify');

const router = express.Router();
router.use(requireAuth);
const genId = () => crypto.randomUUID();
const PG_UNIQUE_VIOLATION = '23505';

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM drivers WHERE user_id = $1 ORDER BY added_at ASC', [req.userId]);
  res.json({ success: true, drivers: rows.map(S.driver) });
});

router.post('/', async (req, res) => {
  const name = (req.body?.name || '').trim();
  const license = (req.body?.license || '').trim().toUpperCase();

  if (!name) return res.status(400).json({ success: false, message: 'Driver name is required.' });
  if (!/^[A-Z0-9]+$/.test(license)) return res.status(400).json({ success: false, message: 'Driving license can only contain uppercase letters and numbers.' });

  const id = genId();
  const now = new Date().toISOString();
  try {
    await db.query(`
      INSERT INTO drivers (id, user_id, name, license, added_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, req.userId, name, license, now]);
  } catch (err) {
    if (err.code === PG_UNIQUE_VIOLATION) {
      return res.status(409).json({ success: false, message: 'This driving license is already registered.' });
    }
    throw err;
  }

  await addNotification(req.userId, `New driver added: ${name}`);
  const { rows } = await db.query('SELECT * FROM drivers WHERE id = $1', [id]);
  res.status(201).json({ success: true, driver: S.driver(rows[0]) });
});

router.delete('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM drivers WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  const row = rows[0];
  if (!row) return res.status(404).json({ success: false, message: 'Driver not found.' });
  await db.query('DELETE FROM drivers WHERE id = $1', [req.params.id]);
  await addNotification(req.userId, `Driver removed: ${row.name}`);
  res.json({ success: true, driver: S.driver(row) });
});

/* Assign / update this month's salary figure */
router.patch('/:id/salary', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM drivers WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Driver not found.' });

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ success: false, message: 'Please enter a valid salary amount.' });

  await db.query(
    'UPDATE drivers SET last_salary = $1, last_salary_date = $2, is_salary_paid = false WHERE id = $3',
    [amount, new Date().toISOString(), req.params.id]
  );
  const { rows: updated } = await db.query('SELECT * FROM drivers WHERE id = $1', [req.params.id]);
  res.json({ success: true, driver: S.driver(updated[0]) });
});

/* Toggle paid/pending status for the assigned salary */
router.patch('/:id/salary-status', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM drivers WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  const row = rows[0];
  if (!row) return res.status(404).json({ success: false, message: 'Driver not found.' });

  await db.query('UPDATE drivers SET is_salary_paid = $1 WHERE id = $2', [!row.is_salary_paid, req.params.id]);
  const { rows: updated } = await db.query('SELECT * FROM drivers WHERE id = $1', [req.params.id]);
  res.json({ success: true, driver: S.driver(updated[0]) });
});

module.exports = router;
