const express = require("express");
const router = express.Router();
const User = require("../models/Users");
const Contact = require("../models/Contact"); // ✅ ADD THIS

// LOGIN (ONLY ALLOWED USERS)
router.post("/login", async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }

    // 🔥 STEP 1: Check contact exists
    const contact = await Contact.findOne({ mobile: phone });

    if (!contact) {
      return res.status(401).json({
        error: "You are not allowed. Contact admin.",
      });
    }

    // 🔥 STEP 2: Find or create user
    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        name: contact.name, // use admin name
        phone: contact.mobile,
      });
    }

    res.json(user);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;