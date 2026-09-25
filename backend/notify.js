const crypto = require('crypto');
const db = require('./db');

const MAX_PER_USER = 25;

/* Insert a notification for a user and trim their history to the most
   recent MAX_PER_USER so the table doesn't grow forever. */
function addNotification(userId, message) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO notifications (id, user_id, message, time) VALUES (?, ?, ?, ?)')
    .run(id, userId, message, new Date().toISOString());

  const excess = db.prepare(`
    SELECT id FROM notifications WHERE user_id = ? ORDER BY time DESC LIMIT -1 OFFSET ?
  `).all(userId, MAX_PER_USER);
  if (excess.length) {
    const del = db.prepare('DELETE FROM notifications WHERE id = ?');
    excess.forEach(r => del.run(r.id));
  }
}

module.exports = { addNotification };
