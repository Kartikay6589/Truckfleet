const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const S = require('../serialize');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);
const genId = () => crypto.randomUUID();

const GST_TYPES = ['NILL', 'IGST', 'CSGST'];

/* Recompute TDS/GST/net total/balance from the raw inputs — never trust
   pre-computed totals from the client for money math. */
function computeAmounts({ total, tdsRate, gstType, gstRate, advance }) {
  const tdsAmount = Math.round((total * (tdsRate || 0)) / 100);
  const gstAmount = Math.round((total * (gstRate || 0)) / 100);
  const netTotal = total - tdsAmount + gstAmount;
  const balance = netTotal - advance;
  return { tdsAmount, gstAmount, netTotal, balance };
}

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM trips WHERE user_id = $1 ORDER BY registered_at ASC', [req.userId]);
  res.json({ success: true, trips: rows.map(S.trip) });
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM trips WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Trip not found.' });
  res.json({ success: true, trip: S.trip(rows[0]) });
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const from = (b.from || '').trim();
  const to = (b.to || '').trim();
  const total = Number(b.total);
  const advance = Number(b.advance) || 0;
  const tdsRate = Number(b.tdsRate) || 0;
  const gstType = GST_TYPES.includes(b.gstType) ? b.gstType : 'NILL';
  const gstRate = gstType === 'NILL' ? 0 : (Number(b.gstRate) || 0);

  if (!b.vehicleId || !b.vehicleNumber) return res.status(400).json({ success: false, message: 'Please select a vehicle.' });
  if (!from) return res.status(400).json({ success: false, message: 'Pickup location is required.' });
  if (!to) return res.status(400).json({ success: false, message: 'Delivery location is required.' });
  if (!total || total <= 0) return res.status(400).json({ success: false, message: 'Please enter a valid total amount.' });
  if (advance < 0) return res.status(400).json({ success: false, message: 'Advance cannot be negative.' });

  const { tdsAmount, gstAmount, netTotal, balance } = computeAmounts({ total, tdsRate, gstType, gstRate, advance });
  if (advance > netTotal) return res.status(400).json({ success: false, message: 'Advance cannot exceed the total amount.' });

  const id = genId();
  const now = new Date().toISOString();
  await db.query(`
    INSERT INTO trips (
      id, user_id, vehicle_id, vehicle_number, vehicle_type, from_loc, to_loc, cycle_origin,
      original_total, tds_percent, tds_amount, gst_type, gst_percent, gst_amount,
      total, advance, balance, paid, paid_at, registered_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, false, NULL, $18)
  `, [
    id, req.userId, b.vehicleId, b.vehicleNumber, b.vehicleType || '', from, to, b.cycleOrigin || from,
    total, tdsRate, tdsAmount, gstType, gstRate, gstAmount,
    netTotal, advance, balance, now
  ]);

  const { rows } = await db.query('SELECT * FROM trips WHERE id = $1', [id]);
  res.status(201).json({ success: true, trip: S.trip(rows[0]) });
});

/* Live-edit the advance paid (trip detail page) */
router.patch('/:id/advance', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM trips WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  const row = rows[0];
  if (!row) return res.status(404).json({ success: false, message: 'Trip not found.' });

  const advance = Number(req.body?.advance);
  if (!Number.isFinite(advance) || advance < 0) return res.status(400).json({ success: false, message: 'Please enter a valid advance amount.' });

  const balance = row.total - advance;
  await db.query('UPDATE trips SET advance = $1, balance = $2 WHERE id = $3', [advance, balance, req.params.id]);
  const { rows: updated } = await db.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
  res.json({ success: true, trip: S.trip(updated[0]) });
});

/* Live-edit fuel/toll/driver expenses (trip detail page) */
router.patch('/:id/expenses', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM trips WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Trip not found.' });

  const fuel = Number(req.body?.fuelExpense) || 0;
  const toll = Number(req.body?.tollExpense) || 0;
  const driver = Number(req.body?.driverExpense) || 0;

  await db.query(
    'UPDATE trips SET fuel_expense = $1, toll_expense = $2, driver_expense = $3 WHERE id = $4',
    [fuel, toll, driver, req.params.id]
  );
  const { rows: updated } = await db.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
  res.json({ success: true, trip: S.trip(updated[0]) });
});

/* Mark the remaining balance as received, recording final expenses */
router.post('/:id/mark-paid', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM trips WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Trip not found.' });

  const fuel = Number(req.body?.fuelExpense) || 0;
  const toll = Number(req.body?.tollExpense) || 0;
  const driver = Number(req.body?.driverExpense) || 0;
  const now = new Date().toISOString();

  await db.query(`
    UPDATE trips SET paid = true, paid_at = $1, balance = 0, fuel_expense = $2, toll_expense = $3, driver_expense = $4
    WHERE id = $5
  `, [now, fuel, toll, driver, req.params.id]);

  const { rows: updated } = await db.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
  res.json({ success: true, trip: S.trip(updated[0]) });
});

module.exports = router;
