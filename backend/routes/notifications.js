const express = require('express');
const db = require('../db');
const S = require('../serialize');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY time DESC LIMIT 25', [req.userId]);
  res.json({ success: true, notifications: rows.map(S.notification) });
});

module.exports = router;
