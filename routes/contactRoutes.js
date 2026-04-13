const express = require("express");
const Contact = require("../models/Contact");
const router = express.Router();

// GET all contacts (optionally filter by tag)
router.get("/contacts", async (req, res) => {
  try {
    const { tag } = req.query;
    let filter = {};
    if (tag) filter.tags = tag;
    const contacts = await Contact.find(filter).populate("tags");
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create contact
router.post("/contacts", async (req, res) => {
  try {
    const { name, mobile, tags, source, createdBy } = req.body;
    if (!mobile) return res.status(400).json({ error: "Mobile number required" });
    const existing = await Contact.findOne({ mobile });
    if (existing) return res.status(400).json({ error: "Contact already exists" });
    const contact = new Contact({
      name: name || "UNKNOWN",
      mobile,
      tags: tags || [],
      source: source || "MANUAL",
      createdBy: createdBy || "test_user",
    });
    await contact.save();
    const populated = await contact.populate("tags");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update contact
router.put("/contacts/:id", async (req, res) => {
  try {
    const { name, mobile, tags, source } = req.body;
    const contactId = req.params.id;

    const contact = await Contact.findById(contactId);
    if (!contact) return res.status(404).json({ error: "Contact not found" });

    // If mobile is changed, check uniqueness
    if (mobile && mobile !== contact.mobile) {
      const existing = await Contact.findOne({ mobile, _id: { $ne: contactId } });
      if (existing) return res.status(400).json({ error: "Mobile number already exists" });
      contact.mobile = mobile;
    }

    if (name !== undefined) contact.name = name || "UNKNOWN";
    if (tags !== undefined) contact.tags = tags;
    if (source !== undefined) contact.source = source;

    await contact.save();
    const populated = await contact.populate("tags");
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE contact
router.delete("/contacts/:id", async (req, res) => {
  try {
    const deleted = await Contact.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Contact not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;