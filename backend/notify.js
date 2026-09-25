const crypto = require('crypto');
const db = require('./db');

const MAX_PER_USER = 25;

/* Insert a notification for a user and trim their history to the most
   recent MAX_PER_USER so the table doesn't grow forever. */
async function addNotification(userId, message) {
  const id = crypto.randomUUID();
  await db.query(
    'INSERT INTO notifications (id, user_id, message, time) VALUES ($1, $2, $3, $4)',
    [id, userId, message, new Date().toISOString()]
  );

  await db.query(`
    DELETE FROM notifications
    WHERE id IN (
      SELECT id FROM notifications
      WHERE user_id = $1
      ORDER BY time DESC
      OFFSET $2
    )
  `, [userId, MAX_PER_USER]);
}

module.exports = { addNotification };
