const express = require("express");
const router = express.Router();
const User = require("../models/Users");
const Contact = require("../models/Contact");
const generateToken = require("../utils/generateToken");

// LOGIN (ONLY ALLOWED USERS)
router.post("/login", async (req, res) => {
  try {
    const { phone } = req.body;

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
        name: contact.name,
        phone: contact.mobile,
      });
    }

    // 🔐 STEP 3: GENERATE JWT TOKEN
    const token = generateToken(user);

    // ✅ SEND TOKEN + USER
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
      },
    });

  } catch (err) {
    console.error("Login Error:", err); // 👈 better debugging
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
