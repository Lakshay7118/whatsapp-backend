const express = require("express");
const Tag = require("../models/Tag");
const router = express.Router();

// GET all tags
router.get("/tags", async (req, res) => {
  try {
    const tags = await Tag.find().sort({ createdAt: -1 });
    res.json({ success: true, tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create tag
router.post("/tags", async (req, res) => {
  try {
    const { name, createdBy } = req.body;
    if (!name) return res.status(400).json({ error: "Tag name required" });
    const tag = new Tag({ name, createdBy });
    await tag.save();
    res.status(201).json({ success: true, tag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update tag (status only)
router.put("/tags/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const tag = await Tag.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!tag) return res.status(404).json({ error: "Tag not found" });
    res.json({ success: true, tag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE tag
router.delete("/tags/:id", async (req, res) => {
  try {
    const deleted = await Tag.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Tag not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;