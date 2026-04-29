const express = require("express");
const router = express.Router();

const Chat = require("../models/chat");
const enrichChat = require("../utils/enrichChat");
const { getIO } = require("../sockets/socket");

const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware"); // 🔥 optional use


// =======================
// ✅ CREATE CHAT (ALL ROLES)
// =======================
router.post(
  "/",
  protect,
  async (req, res) => {
    try {
      const senderPhone = req.user?.phone;
      const { receiverPhone } = req.body;

      if (!senderPhone) {
        throw new Error("senderPhone missing from JWT");
      }

      if (!receiverPhone) {
        return res.status(400).json({ error: "receiverPhone is required" });
      }

      let chat = await Chat.findOne({
        participants: { $all: [senderPhone, receiverPhone] },
      });

      if (!chat) {
        chat = await Chat.create({
          participants: [senderPhone, receiverPhone],
        });
      } else {
        // ✅ FIX: remove sender from deletedBy so it reappears after refresh
        chat = await Chat.findByIdAndUpdate(
          chat._id,
          { $pull: { deletedBy: senderPhone } },
          { new: true }
        );
      }

      return res.json(chat);

    } catch (err) {
      console.error("CREATE CHAT ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// =======================
// ✅ GET USER CHATS (ALL ROLES)
// =======================
router.get(
  "/",
  protect,
  async (req, res) => {
    try {
      const userPhone = req.user.phone;

      const chats = await Chat.find({
        participants: { $in: [userPhone] },
        deletedBy: { $ne: userPhone },
      }).sort({ updatedAt: -1 });

      const enrichedChats = await Promise.all(
        chats.map((chat) => enrichChat(chat, userPhone))
      );

      res.json(enrichedChats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ DELETE CHAT (ROLE + OWNER BASED)
// =======================
router.delete(
  "/:chatId",
  protect,
  async (req, res) => {
    try {
      const { chatId } = req.params;
      const userPhone = req.user.phone;
      const userRole = req.user.role; // 🔥 IMPORTANT

      const chat = await Chat.findById(chatId);

      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      // ✅ ADMIN OVERRIDE
      const isAdmin = ["super_admin", "manager"].includes(userRole);

      const isParticipant = chat.participants.some(
        (p) => String(p) === String(userPhone)
      );

      if (!isParticipant && !isAdmin) {
        return res.status(403).json({
          error: "Not authorized to delete this chat",
        });
      }

      const updated = await Chat.findByIdAndUpdate(
        chatId,
        { $addToSet: { deletedBy: userPhone } },
        { new: true }
      );

      const io = getIO();
      io.to(userPhone).emit("chatDeleted", { chatId, userPhone });

      res.json({ message: "Chat deleted successfully" });

    } catch (err) {
      console.error("DELETE CHAT ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);


module.exports = router;