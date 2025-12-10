const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

router.get("/:channelId", auth, async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    const limit = parseInt(req.query.limit, 10) || 20;
    const cursor = req.query.cursor; // ISO string or null

    let query = `
      SELECT m.id, m.content, m.created_at,
             u.id AS user_id, u.name AS user_name
      FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = $1
    `;
    const params = [channelId];

    if (cursor) {
      params.push(cursor);
      query += ` AND m.created_at < $2`;
    }

    query += ` ORDER BY m.created_at DESC LIMIT ${limit}`;

    const result = await db.query(query, params);

    const rows = result.rows.reverse();

    const messages = rows.map((r) => ({
      id: r.id,
      channel_id: channelId,
      content: r.content,
      created_at: r.created_at,
      user: {
        id: r.user_id,
        name: r.user_name,
      },
    }));

    const nextCursor = messages.length > 0 ? messages[0].created_at : null;

    res.json({ messages, nextCursor });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:channelId", auth, async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content required" });
    }

    const result = await db.query(
      `INSERT INTO messages (channel_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, channel_id, user_id, content, created_at`,
      [channelId, req.user.id, content.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create message error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
