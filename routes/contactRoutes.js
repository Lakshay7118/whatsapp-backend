// routes/contactRoutes.js
const express = require("express");
const Contact = require("../models/Contact");
const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");
const router = express.Router();


// =======================
// ✅ GET ALL CONTACTS
// =======================
router.get(
  "/contacts",
  protect,
  allowRoles("super_admin", "manager", "user"),
  async (req, res) => {
    try {
      const { tag, managerId } = req.query;
      let filter = {};

      if (req.user.role === "super_admin") {
        if (managerId) filter.createdBy = managerId;
      } else {
        filter.status = "approved";
      }

      if (tag) filter.tags = tag;

      const contacts = await Contact.find(filter)
        .populate("tags")
        .populate("createdBy", "name phone role");

      res.json(contacts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ GET ALL MANAGERS
// =======================
router.get(
  "/contacts/managers",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const User = require("../models/Users");
      const managers = await User.find({ role: "manager" }).select("name phone role createdAt");
      res.json(managers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ GET PENDING CONTACTS
// =======================
router.get(
  "/contacts/pending",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const contacts = await Contact.find({ status: "pending" })
        .populate("tags")
        .populate("createdBy", "name phone role");
      res.json(contacts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ CREATE CONTACT
// =======================
router.post(
  "/contacts",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const { name, mobile, email, tags, source, role } = req.body; // ✅ email added

      if (!mobile) {
        return res.status(400).json({ error: "Mobile number required" });
      }

      const existing = await Contact.findOne({ mobile });
      if (existing) {
        return res.status(400).json({ error: "Contact already exists" });
      }

      const status = req.user.role === "super_admin" ? "approved" : "pending";

      const contact = new Contact({
        name: name || "UNKNOWN",
        mobile,
        email: email || null,       // ✅ save email
        tags: tags || [],
        source: source || "MANUAL",
        role: role || "user",
        status,
        createdBy: req.user.id,
      });

      await contact.save();
      const populated = await contact.populate("tags");
      res.status(201).json(populated);

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ APPROVE CONTACT
// =======================
router.put(
  "/contacts/:id/approve",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const contact = await Contact.findByIdAndUpdate(
        req.params.id,
        { status: "approved" },
        { new: true }
      ).populate("tags").populate("createdBy", "name phone role");

      if (!contact) return res.status(404).json({ error: "Contact not found" });

      res.json(contact);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ REJECT CONTACT
// =======================
router.put(
  "/contacts/:id/reject",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const contact = await Contact.findByIdAndUpdate(
        req.params.id,
        { status: "rejected" },
        { new: true }
      ).populate("tags").populate("createdBy", "name phone role");

      if (!contact) return res.status(404).json({ error: "Contact not found" });

      res.json(contact);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ UPDATE CONTACT
// =======================
router.put(
  "/contacts/:id",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const { name, mobile, email, tags, source, role } = req.body; // ✅ email added
      const contactId = req.params.id;

      const contact = await Contact.findById(contactId);
      if (!contact) return res.status(404).json({ error: "Contact not found" });

      if (
        req.user.role === "manager" &&
        contact.createdBy.toString() !== req.user.id
      ) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (req.user.role !== "super_admin") {
        contact.status = "pending";
      }

      if (mobile && mobile !== contact.mobile) {
        const existing = await Contact.findOne({ mobile, _id: { $ne: contactId } });
        if (existing) return res.status(400).json({ error: "Mobile number already exists" });
        contact.mobile = mobile;
      }

      if (name !== undefined) contact.name = name || "UNKNOWN";
      if (email !== undefined) contact.email = email || null;  // ✅ update email
      if (tags !== undefined) contact.tags = tags;
      if (source !== undefined) contact.source = source;

      if (role !== undefined) {
        if (req.user.role !== "super_admin") {
          return res.status(403).json({ error: "Only super_admin can change roles" });
        }
        contact.role = role;
      }

      await contact.save();
      const populated = await contact.populate("tags");
      res.json(populated);

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


// =======================
// ✅ DELETE CONTACT
// =======================
router.delete(
  "/contacts/:id",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const deleted = await Contact.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Contact not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


module.exports = router;