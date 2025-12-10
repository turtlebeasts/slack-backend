const express = require("express");
const db = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

router.get("/joined", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT c.id, c.name, c.description, c.created_at,
              COUNT(cm2.id)::int AS member_count
       FROM channels c
       JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $1
       LEFT JOIN channel_members cm2 ON cm2.channel_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("List joined channels error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.id, c.name, c.description, c.created_at,
              COUNT(cm.id)::int AS member_count
       FROM channels c
       LEFT JOIN channel_members cm ON cm.channel_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("List channels error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: "Name required" });

    const result = await db.query(
      "INSERT INTO channels (name, description, created_by) VALUES ($1, $2, $3) RETURNING *",
      [name, description || null, req.user.id]
    );

    await db.query(
      "INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [result.rows[0].id, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create channel error:", err);
    if (err.code === "23505") {
      return res.status(409).json({ message: "Channel name already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/join", auth, async (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);

    await db.query(
      "INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [channelId, req.user.id]
    );

    res.json({ message: "Joined channel" });
  } catch (err) {
    console.error("Join channel error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/leave", auth, async (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);

    await db.query(
      "DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2",
      [channelId, req.user.id]
    );

    res.json({ message: "Left channel" });
  } catch (err) {
    console.error("Leave channel error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id", auth, async (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);

    const channelRes = await db.query(
      "SELECT id, name, description, created_at FROM channels WHERE id = $1",
      [channelId]
    );
    if (channelRes.rows.length === 0) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const membersRes = await db.query(
      `SELECT u.id, u.name, u.email
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = $1`,
      [channelId]
    );

    res.json({
      ...channelRes.rows[0],
      members: membersRes.rows,
    });
  } catch (err) {
    console.error("Get channel error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
