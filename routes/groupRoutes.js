const express = require("express");
const router = express.Router();
const Chat = require("../models/chat");
const protect = require("../middleware/authMiddleware"); // ✅ JWT

// =======================
// ✅ GET ALL GROUPS
// =======================
router.get("/", protect, async (req, res) => {
  try {
    const userPhone = req.user.phone;

    // 🔐 Only groups where user is participant
    const groups = await Chat.find({
      isGroup: true,
      participants: { $in: [userPhone] },
    });

    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// ✅ CREATE GROUP
// =======================
router.post("/", protect, async (req, res) => {
  try {
    const creatorPhone = req.user.phone; // 🔐 from JWT
    const { groupName, participants } = req.body;

    if (!groupName || !participants || !participants.length) {
      return res.status(400).json({
        error: "Missing group name or participants",
      });
    }

    // 🔐 Ensure creator is included
    const uniqueParticipants = [...new Set([...participants, creatorPhone])];

    const chat = await Chat.create({
      participants: uniqueParticipants,
      isGroup: true,
      groupName,
      admin: creatorPhone, // 🔥 backend decides admin
      status: "active",
    });

    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
