const express = require('express');
const db = require('../db');
const S = require('../serialize');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY time DESC LIMIT 25').all(req.userId);
  res.json({ success: true, notifications: rows.map(S.notification) });
});

module.exports = router;
