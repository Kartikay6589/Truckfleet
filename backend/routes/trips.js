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

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM trips WHERE user_id = ? ORDER BY registered_at ASC').all(req.userId);
  res.json({ success: true, trips: rows.map(S.trip) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Trip not found.' });
  res.json({ success: true, trip: S.trip(row) });
});

router.post('/', (req, res) => {
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
  db.prepare(`
    INSERT INTO trips (
      id, user_id, vehicle_id, vehicle_number, vehicle_type, from_loc, to_loc, cycle_origin,
      original_total, tds_percent, tds_amount, gst_type, gst_percent, gst_amount,
      total, advance, balance, paid, paid_at, registered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
  `).run(
    id, req.userId, b.vehicleId, b.vehicleNumber, b.vehicleType || '', from, to, b.cycleOrigin || from,
    total, tdsRate, tdsAmount, gstType, gstRate, gstAmount,
    netTotal, advance, balance, now
  );

  res.status(201).json({ success: true, trip: S.trip(db.prepare('SELECT * FROM trips WHERE id = ?').get(id)) });
});

/* Live-edit the advance paid (trip detail page) */
router.patch('/:id/advance', (req, res) => {
  const row = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Trip not found.' });

  const advance = Number(req.body?.advance);
  if (!Number.isFinite(advance) || advance < 0) return res.status(400).json({ success: false, message: 'Please enter a valid advance amount.' });

  const balance = row.total - advance;
  db.prepare('UPDATE trips SET advance = ?, balance = ? WHERE id = ?').run(advance, balance, req.params.id);
  res.json({ success: true, trip: S.trip(db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id)) });
});

/* Live-edit fuel/toll/driver expenses (trip detail page) */
router.patch('/:id/expenses', (req, res) => {
  const row = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Trip not found.' });

  const fuel = Number(req.body?.fuelExpense) || 0;
  const toll = Number(req.body?.tollExpense) || 0;
  const driver = Number(req.body?.driverExpense) || 0;

  db.prepare('UPDATE trips SET fuel_expense = ?, toll_expense = ?, driver_expense = ? WHERE id = ?')
    .run(fuel, toll, driver, req.params.id);
  res.json({ success: true, trip: S.trip(db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id)) });
});

/* Mark the remaining balance as received, recording final expenses */
router.post('/:id/mark-paid', (req, res) => {
  const row = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Trip not found.' });

  const fuel = Number(req.body?.fuelExpense) || 0;
  const toll = Number(req.body?.tollExpense) || 0;
  const driver = Number(req.body?.driverExpense) || 0;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE trips SET paid = 1, paid_at = ?, balance = 0, fuel_expense = ?, toll_expense = ?, driver_expense = ?
    WHERE id = ?
  `).run(now, fuel, toll, driver, req.params.id);

  res.json({ success: true, trip: S.trip(db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id)) });
});

module.exports = router;
