// sockets/socket.js
const { Server } = require("socket.io");

let io;

// phone → Set of socketIds (BEST approach instead of count)
const onlineUsers = new Map();
const lastSeenMap = {};

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 5000,
    pingInterval: 10000,
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // ================= CHAT ROOM =================
    socket.on("joinChat", (chatId) => {
      socket.join(chatId);
    });

    // ================= USER ONLINE =================
    socket.on("joinUserRoom", (userPhone) => {
      if (!userPhone) return;

      // ❌ prevent duplicate join from same socket
      if (socket.userPhone === userPhone) return;

      socket.userPhone = userPhone;
      socket.join(userPhone);

      let userSockets = onlineUsers.get(userPhone);

      if (!userSockets) {
        userSockets = new Set();
        onlineUsers.set(userPhone, userSockets);
      }

      userSockets.add(socket.id);

      delete lastSeenMap[userPhone];

      emitPresence();
    });

    // ================= USER LEAVE =================
    socket.on("leaveUserRoom", (userPhone) => {
      if (!userPhone) return;

      const userSockets = onlineUsers.get(userPhone);
      if (!userSockets) return;

      userSockets.delete(socket.id);

      if (userSockets.size === 0) {
        onlineUsers.delete(userPhone);
        lastSeenMap[userPhone] = new Date().toISOString();
      }

      emitPresence();
    });

    // ================= DISCONNECT =================
    socket.on("disconnect", () => {
      const userPhone = socket.userPhone;
      if (!userPhone) return;

      const userSockets = onlineUsers.get(userPhone);
      if (!userSockets) return;

      userSockets.delete(socket.id);

      if (userSockets.size === 0) {
        onlineUsers.delete(userPhone);
        lastSeenMap[userPhone] = new Date().toISOString();
      }

      emitPresence();
    });

    // ================= OTHER EVENTS =================
    socket.on("typing", ({ chatId, user }) => {
      socket.to(chatId).emit("userTyping", { chatId, user });
    });

    socket.on("markRead", ({ chatId }) => {
      socket.to(chatId).emit("messagesSeen", { chatId });
    });

    socket.on("chatDeleted", ({ chatId, userPhone }) => {
      io.to(userPhone).emit("chatDeleted", { chatId, userPhone });
    });

    socket.on("chatDeletedPermanently", ({ chatId }) => {
      io.to(chatId).emit("chatDeletedPermanently", { chatId });
    });

    socket.on("pinChat", ({ chatId, userPhone, pinned }) => {
      io.to(userPhone).emit("chatPinned", { chatId, pinned });
    });

    socket.on("clearChat", ({ chatId, userPhone }) => {
      io.to(userPhone).emit("chatCleared", { chatId });
    });
  });

  // ================= EMIT PRESENCE =================
const emitPresence = () => {
  // ✅ clean stale lastSeen for any user who is currently online
  onlineUsers.forEach((_, phone) => { delete lastSeenMap[phone]; });
  
  io.emit("onlineUsers", {
    users: Array.from(onlineUsers.keys()),
    lastSeen: lastSeenMap,
  });
};
  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};

module.exports = { initSocket, getIO };7