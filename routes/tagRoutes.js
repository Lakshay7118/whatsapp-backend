const express = require("express");
const Tag = require("../models/Tag");

const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware"); // 🔥 ADD

const router = express.Router();


// =======================
// ✅ GET ALL TAGS (ALL ROLES)
// =======================
router.get(
  "/tags",
  protect,
  allowRoles("super_admin", "manager", "user"),
  async (req, res) => {
    try {
      let filter = {};

      // 🔥 OPTIONAL: manager sees only own tags
      if (req.user.role === "manager") {
        filter.createdBy = req.user.id;
      }

      const tags = await Tag.find(filter)
        .sort({ createdAt: -1 });

      res.json({ success: true, tags });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ CREATE TAG (ADMIN + MANAGER)
// =======================
router.post(
  "/tags",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Tag name required" });
      }

      // 🔥 prevent duplicate tags
      const existing = await Tag.findOne({ name });

      if (existing) {
        return res.status(400).json({ error: "Tag already exists" });
      }

      const tag = new Tag({
        name,
        createdBy: req.user.id, // 🔐 secure
      });

      await tag.save();

      res.status(201).json({ success: true, tag });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ UPDATE TAG (ADMIN + MANAGER)
// =======================
router.put(
  "/tags/:id",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const { status, name } = req.body;

      const tag = await Tag.findById(req.params.id);

      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }

      // 🔥 manager can update only own tags
      if (
        req.user.role === "manager" &&
        tag.createdBy.toString() !== req.user.id
      ) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (name !== undefined) tag.name = name;
      if (status !== undefined) tag.status = status;

      await tag.save();

      res.json({ success: true, tag });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ DELETE TAG (ONLY SUPER ADMIN)
// =======================
router.delete(
  "/tags/:id",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const tag = await Tag.findById(req.params.id);

      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }

      await tag.deleteOne();

      res.json({ success: true });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


module.exports = router;