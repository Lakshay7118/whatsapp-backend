const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");
const User = require("../models/Users");
const Contact = require("../models/Contact");
const generateToken = require("../utils/generateToken");


// =======================
// ✅ LOGIN BY EMAIL + PASSWORD
// =======================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!password) return res.status(400).json({ error: "Password is required" });

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Check password
    if (!user.password) {
      return res.status(401).json({ error: "No password set. Contact admin." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// =======================
// ✅ GET ALL USERS (for assignment dropdown)
// =======================
router.get("/", protect, allowRoles("super_admin", "manager"), async (req, res) => {
  try {
    const users = await User.find().select("name phone email role").lean();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// =======================
// ✅ CREATE USER (super_admin → manager/user | manager → user only)
// =======================
router.post(
  "/users/create",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const { name, phone, email, password, role } = req.body;

      if (!email) return res.status(400).json({ error: "Email required" });
      if (!password) return res.status(400).json({ error: "Password required" });

      // manager can only create users, not managers or admins
      if (req.user.role === "manager" && role !== "user") {
        return res.status(403).json({ error: "Manager can only create users" });
      }

      let user = await User.findOne({ email: email.toLowerCase() });
      if (user) return res.status(400).json({ error: "User already exists" });

      const hashedPassword = await bcrypt.hash(password, 10);

      user = await User.create({
        name: name || "UNKNOWN",
        phone,
        email: email.toLowerCase(),
        password: hashedPassword,
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