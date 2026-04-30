const express = require("express");
const router = express.Router();

const Chat = require("../models/chat");
const Message = require("../models/message");
const { getIO } = require("../sockets/socket");

const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");


// =======================
// ✅ GET ALL GROUPS (ALL ROLES)
// =======================
router.get("/", protect, async (req, res) => {
  try {
    const userPhone = req.user.phone;

    const groups = await Chat.find({
      isGroup: true,
      participants: { $in: [userPhone] },
      deletedBy: { $ne: userPhone },
    });

    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =======================
// ✅ CREATE GROUP (super_admin + manager ONLY)
// =======================
router.post("/", protect, allowRoles("super_admin", "manager"), async (req, res) => {
  try {
    const creatorPhone = req.user.phone;
    const { groupName, participants } = req.body;

    if (!groupName || !participants || !participants.length) {
      return res.status(400).json({ error: "Missing group name or participants" });
    }

    const uniqueParticipants = [...new Set([...participants, creatorPhone])];

    const chat = await Chat.create({
      participants: uniqueParticipants,
      isGroup: true,
      groupName,
      admin: creatorPhone,
      status: "active",
      createdBy: req.user.id,
    });

    res.json(chat);
  } catch (err) {
    console.error("GROUP CREATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// =======================
// ✅ SOFT DELETE GROUP — Delete for me (ALL ROLES)
// =======================
router.delete("/:groupId", protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userPhone = req.user.phone;
    const userRole = req.user.role;

    const group = await Chat.findOne({ _id: groupId, isGroup: true });
    if (!group) return res.status(404).json({ error: "Group not found" });

    const isParticipant = group.participants.some(p => String(p) === String(userPhone));
    const isAdmin = ["super_admin", "manager"].includes(userRole);

    if (!isParticipant && !isAdmin) {
      return res.status(403).json({ error: "Not authorized to delete this group" });
    }

    await Chat.findByIdAndUpdate(
      groupId,
      { $addToSet: { deletedBy: userPhone } },
      { new: true }
    );

    const io = getIO();
    io.to(userPhone).emit("chatDeleted", { chatId: groupId, userPhone });

    res.json({ message: "Group removed from your list" });
  } catch (err) {
    console.error("DELETE GROUP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// =======================
// ✅ PERMANENT DELETE GROUP — Hard delete from DB (super_admin ONLY)
// =======================
router.delete("/:groupId/permanent", protect, allowRoles("super_admin"), async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Chat.findOne({ _id: groupId, isGroup: true });
    if (!group) return res.status(404).json({ error: "Group not found" });

    // Delete all messages in this group
    await Message.deleteMany({ chatId: groupId });

    // Delete the group itself
    await Chat.findByIdAndDelete(groupId);

    const io = getIO();
    // Notify ALL participants
    group.participants.forEach(phone => {
      io.to(phone).emit("chatDeletedPermanently", { chatId: groupId });
    });

    res.json({ message: "Group permanently deleted from database" });
  } catch (err) {
    console.error("PERMANENT DELETE GROUP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;