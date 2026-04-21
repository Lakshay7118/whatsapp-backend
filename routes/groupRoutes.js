const express = require("express");
const router = express.Router();

const Chat = require("../models/chat");

const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware"); // 🔥 ADD


// =======================
// ✅ GET ALL GROUPS (ALL ROLES)
// =======================
router.get(
  "/",
  protect,
  async (req, res) => {
    try {
      const userPhone = req.user.phone;

      const groups = await Chat.find({
        isGroup: true,
        participants: { $in: [userPhone] },
      });

      res.json(groups);

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ CREATE GROUP (ADMIN + MANAGER ONLY)
// =======================
router.post(
  "/",
  protect,
  allowRoles("super_admin", "manager"), // 🔥 IMPORTANT
  async (req, res) => {
    try {
      const creatorPhone = req.user.phone;
      const { groupName, participants } = req.body;

      if (!groupName || !participants || !participants.length) {
        return res.status(400).json({
          error: "Missing group name or participants",
        });
      }

      // 🔐 Ensure creator is always included
      const uniqueParticipants = [
        ...new Set([...participants, creatorPhone]),
      ];

      const chat = await Chat.create({
        participants: uniqueParticipants,
        isGroup: true,
        groupName,
        admin: creatorPhone, // ✅ backend controlled
        status: "active",
        createdBy: req.user.id, // 🔥 TRACK CREATOR
      });

      res.json(chat);

    } catch (err) {
      console.error("GROUP CREATE ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);


module.exports = router;