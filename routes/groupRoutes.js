const express = require("express");
const router = express.Router();
const Chat = require("../models/chat");

// GET /api/groups – list all groups
router.get("/", async (req, res) => {
  try {
    // Find all chats that are groups
    const groups = await Chat.find({ isGroup: true });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/groups – create a new group
router.post("/", async (req, res) => {
  try {
    const { groupName, participants, admin } = req.body;
    if (!groupName || !participants || !participants.length) {
      return res.status(400).json({ error: "Missing group name or participants" });
    }
    const chat = await Chat.create({
      participants,
      isGroup: true,
      groupName,
      admin,
      status: "active",
    });
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;