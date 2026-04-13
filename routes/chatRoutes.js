const express = require("express");
const router = express.Router();
const Chat = require("../models/chat");
const enrichChat = require("../utils/enrichChat");
const { getIO } = require("../sockets/socket");

// CREATE CHAT BETWEEN 2 USERS
router.post("/", async (req, res) => {
  try {
    const { senderPhone, receiverPhone } = req.body;

    let chat = await Chat.findOne({
      participants: { $all: [senderPhone, receiverPhone] },
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [senderPhone, receiverPhone],
      });
    }

    const enriched = await enrichChat(chat, senderPhone);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET CHATS OF A USER (enriched) – with deletedBy filter
router.get("/:phone", async (req, res) => {
  try {
    const { phone } = req.params;

    // ✅ Filter out chats where current user is in deletedBy
    const chats = await Chat.find({
      participants: { $in: [phone] },
      deletedBy: { $ne: phone }
    }).sort({ updatedAt: -1 });

    const enrichedChats = await Promise.all(
      chats.map(chat => enrichChat(chat, phone))
    );

    res.json(enrichedChats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chats/:chatId (soft delete for current user)
router.delete("/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userPhone } = req.body;

    const updated = await Chat.findByIdAndUpdate(
      chatId,
      { $addToSet: { deletedBy: userPhone } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Chat not found" });

    const io = getIO();
    io.to(userPhone).emit("chatDeleted", { chatId, userPhone });
    res.json({ message: "Chat deleted for you" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;