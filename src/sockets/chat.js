const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const db = require("../db");

let io;

function initChatSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  });

  const onlineUsers = new Map();

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("No token"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
      };
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    const current = onlineUsers.get(userId) || 0;
    onlineUsers.set(userId, current + 1);
    broadcastPresence();

    console.log(
      `User ${userId} connected, sockets: ${onlineUsers.get(userId)}`
    );

    socket.on("channel:join", (channelId) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on("channel:leave", (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on("message:send", async ({ channelId, content }) => {
      try {
        if (!content || !content.trim()) return;
        const result = await db.query(
          `INSERT INTO messages (channel_id, user_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, channel_id, user_id, content, created_at`,
          [channelId, userId, content.trim()]
        );

        const message = result.rows[0];

        const payload = {
          id: message.id,
          channel_id: message.channel_id,
          content: message.content,
          created_at: message.created_at,
          user: {
            id: userId,
            name: socket.user.name,
          },
        };

        io.to(`channel:${channelId}`).emit("message:new", payload);
      } catch (err) {
        console.error("Socket message send error:", err);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("disconnect", () => {
      const current = onlineUsers.get(userId) || 0;
      if (current <= 1) {
        onlineUsers.delete(userId);
      } else {
        onlineUsers.set(userId, current - 1);
      }
      broadcastPresence();
      console.log(
        `User ${userId} disconnected, sockets: ${onlineUsers.get(userId) || 0}`
      );
    });

    function broadcastPresence() {
      const onlineIds = Array.from(onlineUsers.keys());
      io.emit("presence:update", { onlineUserIds: onlineIds });
    }
  });
}

module.exports = { initChatSocket };
