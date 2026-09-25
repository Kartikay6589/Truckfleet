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
  const rows = db.prepare('SELECT * FROM vehicles WHERE user_id = ? ORDER BY added_at ASC').all(req.userId);
  res.json({ success: true, vehicles: rows.map(S.vehicle) });
});

router.post('/', (req, res) => {
  const { vehicleNumber, ownerName, driverName, vehicleType } = req.body || {};
  const number = (vehicleNumber || '').trim().toUpperCase();
  const owner = (ownerName || '').trim();

  if (!/^[A-Z0-9]+$/.test(number)) return res.status(400).json({ success: false, message: 'Vehicle number can only contain uppercase letters and numbers.' });
  if (!owner) return res.status(400).json({ success: false, message: 'Owner name is required.' });
  if (!vehicleType) return res.status(400).json({ success: false, message: 'Vehicle type is required.' });

  const dupe = db.prepare('SELECT id FROM vehicles WHERE user_id = ? AND vehicle_number = ?').get(req.userId, number);
  if (dupe) return res.status(409).json({ success: false, message: 'This vehicle number is already registered.' });

  const id = genId();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO vehicles (id, user_id, vehicle_number, owner_name, driver_name, vehicle_type, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.userId, number, owner, (driverName || '').trim(), vehicleType, now);

  addNotification(req.userId, `New vehicle added: ${number} (${vehicleType})`);
  res.status(201).json({ success: true, vehicle: S.vehicle(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id)) });
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ success: false, message: 'Vehicle not found.' });
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
  addNotification(req.userId, `Vehicle removed: ${row.vehicle_number}`);
  res.json({ success: true, vehicle: S.vehicle(row) });
});

module.exports = router;
