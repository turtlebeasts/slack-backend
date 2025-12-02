const http = require("http");
const app = require("./app");
require("dotenv").config();
const { initChatSocket } = require("./sockets/chat");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Attach Socket.IO to same server
initChatSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
