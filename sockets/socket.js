// sockets/socket.js
const { Server } = require("socket.io");

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // ── Join a specific chat room (real-time messaging)
    socket.on("joinChat", (chatId) => {
      socket.join(chatId);
      console.log(`Socket ${socket.id} joined chat ${chatId}`);
    });

    // ── Join personal room via phone number
    // Used for campaign messages, direct user notifications
    socket.on("joinUserRoom", (userPhone) => {
      if (userPhone) {
        socket.join(userPhone);
        console.log(`Socket ${socket.id} joined user room: ${userPhone}`);
      }
    });

    // ── Typing indicator
    socket.on("typing", ({ chatId, user }) => {
      socket.to(chatId).emit("userTyping", { chatId, user });
    });

    // ── Mark messages as read (real-time blue ticks)
    socket.on("markRead", async ({ chatId, userPhone }) => {
      socket.to(chatId).emit("messagesSeen", { chatId, user: userPhone });
    });

    // ── Soft delete: notify only the user who deleted
    // Backend calls: io.to(userPhone).emit("chatDeleted", ...)
    // Frontend removes chat from that user's list only
    socket.on("chatDeleted", ({ chatId, userPhone }) => {
      io.to(userPhone).emit("chatDeleted", { chatId, userPhone });
    });

    // ── Permanent delete: notify ALL participants in the chat room
    // Backend calls: io.to(phone).emit("chatDeletedPermanently", ...) for each participant
    // Frontend removes chat from everyone's list
    socket.on("chatDeletedPermanently", ({ chatId }) => {
      io.to(chatId).emit("chatDeletedPermanently", { chatId });
    });

    // ── Pin chat: notify the user's personal room
    socket.on("pinChat", ({ chatId, userPhone, pinned }) => {
      io.to(userPhone).emit("chatPinned", { chatId, pinned });
    });

    // ── Clear chat: notify the user's personal room
    socket.on("clearChat", ({ chatId, userPhone }) => {
      io.to(userPhone).emit("chatCleared", { chatId });
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