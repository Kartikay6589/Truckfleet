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
  const { rows } = await db.query('SELECT * FROM vehicles WHERE user_id = $1 ORDER BY added_at ASC', [req.userId]);
  res.json({ success: true, vehicles: rows.map(S.vehicle) });
});

router.post('/', async (req, res) => {
  const { vehicleNumber, ownerName, driverName, vehicleType } = req.body || {};
  const number = (vehicleNumber || '').trim().toUpperCase();
  const owner = (ownerName || '').trim();

  if (!/^[A-Z0-9]+$/.test(number)) return res.status(400).json({ success: false, message: 'Vehicle number can only contain uppercase letters and numbers.' });
  if (!owner) return res.status(400).json({ success: false, message: 'Owner name is required.' });
  if (!vehicleType) return res.status(400).json({ success: false, message: 'Vehicle type is required.' });

  const id = genId();
  const now = new Date().toISOString();
  try {
    await db.query(`
      INSERT INTO vehicles (id, user_id, vehicle_number, owner_name, driver_name, vehicle_type, added_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, req.userId, number, owner, (driverName || '').trim(), vehicleType, now]);
  } catch (err) {
    if (err.code === PG_UNIQUE_VIOLATION) {
      return res.status(409).json({ success: false, message: 'This vehicle number is already registered.' });
    }
    throw err;
  }

  await addNotification(req.userId, `New vehicle added: ${number} (${vehicleType})`);
  const { rows } = await db.query('SELECT * FROM vehicles WHERE id = $1', [id]);
  res.status(201).json({ success: true, vehicle: S.vehicle(rows[0]) });
});

router.delete('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM vehicles WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  const row = rows[0];
  if (!row) return res.status(404).json({ success: false, message: 'Vehicle not found.' });
  await db.query('DELETE FROM vehicles WHERE id = $1', [req.params.id]);
  await addNotification(req.userId, `Vehicle removed: ${row.vehicle_number}`);
  res.json({ success: true, vehicle: S.vehicle(row) });
});

module.exports = router;
