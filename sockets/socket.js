// sockets/socket.js
const { Server } = require("socket.io");

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Join a specific chat room (for real‑time messaging)
    socket.on("joinChat", (chatId) => {
      socket.join(chatId);
      console.log(`Socket ${socket.id} joined chat ${chatId}`);
    });

    // 🔥 NEW: Join a personal room using the user's phone number
    // This allows the backend to send events directly to the user (e.g., campaign messages)
    socket.on("joinUserRoom", (userPhone) => {
      if (userPhone) {
        socket.join(userPhone);
        console.log(`Socket ${socket.id} joined user room: ${userPhone}`);
      }
    });

    // Typing indicator
    socket.on("typing", ({ chatId, user }) => {
      socket.to(chatId).emit("userTyping", { chatId, user });
    });

    // Mark messages as read (real-time)
    socket.on("markRead", async ({ chatId, userPhone }) => {
      socket.to(chatId).emit("messagesSeen", { chatId, user: userPhone });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};

module.exports = { initSocket, getIO };