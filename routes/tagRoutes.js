const express = require("express");
const Tag = require("../models/Tag");
const protect = require("../middleware/authMiddleware"); // ✅ JWT
const router = express.Router();

// =======================
// ✅ GET ALL TAGS
// =======================
router.get("/tags", protect, async (req, res) => {
  try {
    const tags = await Tag.find()
      .sort({ createdAt: -1 });

    res.json({ success: true, tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// ✅ CREATE TAG
// =======================
router.post("/tags", protect, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Tag name required" });
    }

    const tag = new Tag({
      name,
      createdBy: req.user.id, // 🔐 from JWT
    });

    await tag.save();

    res.status(201).json({ success: true, tag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// ✅ UPDATE TAG
// =======================
router.put("/tags/:id", protect, async (req, res) => {
  try {
    const { status } = req.body;

    const tag = await Tag.findById(req.params.id);
    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    // 🔐 Optional: restrict to owner
    // if (tag.createdBy.toString() !== req.user.id) {
    //   return res.status(403).json({ error: "Not authorized" });
    // }

    tag.status = status;
    await tag.save();

    res.json({ success: true, tag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// ✅ DELETE TAG
// =======================
router.delete("/tags/:id", protect, async (req, res) => {
  try {
    const tag = await Tag.findById(req.params.id);

    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    // 🔐 Optional: restrict to owner
    // if (tag.createdBy.toString() !== req.user.id) {
    //   return res.status(403).json({ error: "Not authorized" });
    // }

    await tag.deleteOne();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
