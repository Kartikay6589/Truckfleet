const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const S = require('../serialize');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);
const genId = () => crypto.randomUUID();

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM broker_trips WHERE user_id = $1 ORDER BY date DESC', [req.userId]);
  res.json({ success: true, trips: rows.map(S.brokerTrip) });
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM broker_trips WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Brokered trip not found.' });
  res.json({ success: true, trip: S.brokerTrip(rows[0]) });
});

router.post('/', async (req, res) => {
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
  await db.query(`
    INSERT INTO broker_trips (id, user_id, company, owner, vehicle_number, from_loc, to_loc, purchase, sell, date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [id, req.userId, company, owner, vehicleNumber, from, to, purchase, sell, now]);

  const { rows } = await db.query('SELECT * FROM broker_trips WHERE id = $1', [id]);
  res.status(201).json({ success: true, trip: S.brokerTrip(rows[0]) });
});

module.exports = router;
