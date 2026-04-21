const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");     // ✅ ADD
const allowRoles = require("../middleware/roleMiddleware");
const User = require("../models/Users");
const Contact = require("../models/Contact");
const generateToken = require("../utils/generateToken");


// =======================
// ✅ LOGIN (ROLE BASED)
// =======================
router.post("/login", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }

    // 🔥 STEP 1: CHECK CONTACT
    const contact = await Contact.findOne({ mobile: phone });

    if (!contact) {
      return res.status(401).json({
        error: "You are not allowed. Contact admin.",
      });
    }

    // 🔥 STEP 2: GET ROLE FROM CONTACT
    const role = contact.role || "user";

    // 🔥 STEP 3: FIND OR CREATE USER
    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        name: contact.name,
        phone: contact.mobile,
        role: role, // ✅ IMPORTANT
      });
    } else {
      // 🔥 UPDATE ROLE IF CHANGED BY ADMIN
      if (user.role !== role) {
        user.role = role;
        await user.save();
      }
    }

    // 🔐 STEP 4: GENERATE TOKEN (ROLE INCLUDED)
    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role, // ✅ SEND ROLE
      },
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add this in your userRoutes.js

// =======================
// ✅ CREATE USER (super_admin → manager/user | manager → user only)
// =======================
router.post(
  "/users/create",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const { name, phone, role } = req.body;

      if (!phone) return res.status(400).json({ error: "Phone required" });

      // ✅ manager can only create users, not managers or admins
      if (req.user.role === "manager" && role !== "user") {
        return res.status(403).json({ error: "Manager can only create users" });
      }

      // check contact exists
      const contact = await Contact.findOne({ mobile: phone });
      if (!contact) {
        // auto create contact as approved
        await Contact.create({
          name: name || "UNKNOWN",
          mobile: phone,
          role: role || "user",
          status: "approved",
          createdBy: req.user.id,
        });
      }

      let user = await User.findOne({ phone });
      if (user) return res.status(400).json({ error: "User already exists" });

      user = await User.create({
        name: name || "UNKNOWN",
        phone,
        role: role || "user",
        createdBy: req.user.id,
      });

      res.status(201).json({ success: true, user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


module.exports = router;