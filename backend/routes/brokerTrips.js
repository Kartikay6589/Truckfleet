const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const S = require('../serialize');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);
const genId = () => crypto.randomUUID();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM broker_trips WHERE user_id = ? ORDER BY date DESC').all(req.userId);
  res.json({ success: true, trips: rows.map(S.brokerTrip) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM broker_trips WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Brokered trip not found.' });
  res.json({ success: true, trip: S.brokerTrip(row) });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const company = (b.company || '').trim();
  const owner = (b.owner || '').trim();
  const vehicleNumber = (b.vehicleNumber || '').trim().toUpperCase();
  const from = (b.from || '').trim();
  const to = (b.to || '').trim();
  const purchase = Number(b.purchase);
  const sell = Number(b.sell);

  if (!company || !owner || !vehicleNumber) return res.status(400).json({ success: false, message: 'Please fill in all party details.' });
  if (!/^[A-Z0-9]+$/.test(vehicleNumber)) return res.status(400).json({ success: false, message: 'Vehicle number can only contain uppercase letters and numbers.' });
  if (!from || !to) return res.status(400).json({ success: false, message: 'Please fill in both locations.' });
  if (!purchase || purchase <= 0 || !sell || sell <= 0) return res.status(400).json({ success: false, message: 'Please enter valid amounts greater than 0.' });

  const id = genId();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO broker_trips (id, user_id, company, owner, vehicle_number, from_loc, to_loc, purchase, sell, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.userId, company, owner, vehicleNumber, from, to, purchase, sell, now);

  res.status(201).json({ success: true, trip: S.brokerTrip(db.prepare('SELECT * FROM broker_trips WHERE id = ?').get(id)) });
});

module.exports = router;
