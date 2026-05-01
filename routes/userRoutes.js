const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");
const User = require("../models/Users");
const Contact = require("../models/Contact");
const generateToken = require("../utils/generateToken");
const sendEmail = require("../utils/sendEmail");


// =======================
// ✅ STEP 1: SEND OTP
// =======================
// =======================
// ✅ STEP 1: SEND OTP
// =======================
router.post("/send-otp", async (req, res) => {
  try {
    const { phone, email } = req.body;  // ✅ destructure email too

    if (!phone) return res.status(400).json({ error: "Phone is required" });
    if (!email) return res.status(400).json({ error: "Email is required" });

    // Check contact is allowed
    const contact = await Contact.findOne({ mobile: phone });
    if (!contact) {
      return res.status(401).json({ error: "You are not allowed. Contact admin." });
    }

    // Check contact is approved
    if (contact.status !== "approved") {
      return res.status(403).json({ error: "Your account is pending approval. Contact admin." });
    }

    if (!contact.email) {
      return res.status(400).json({ error: "No email linked to this number. Contact admin." });
    }

    // ✅ Verify the email matches what admin registered
    if (contact.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(401).json({ error: "Email does not match our records." });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const role = contact.role || "user";

    // Find or create user, save OTP
    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        name: contact.name,
        phone: contact.mobile,
        role,
        otp,
        otpExpiry,
      });
    } else {
      if (user.role !== role) user.role = role;
      user.otp = otp;
      user.otpExpiry = otpExpiry;
      await user.save();
    }

    // Send OTP email
    await sendEmail({
      to: contact.email,
      subject: "Your Login OTP",
      html: `
        <div style="font-family: sans-serif; max-width: 420px; margin: auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
          <h2 style="color: #25D366; margin-top: 0;">Your OTP Code</h2>
          <p style="color: #444;">Hi <strong>${contact.name}</strong>, use the code below to log in. It expires in <strong>10 minutes</strong>.</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #111; background: #f5f5f5; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #999; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    res.json({ success: true, message: "OTP sent to your registered email." });

  } catch (err) {
    console.error("Send OTP Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// ✅ STEP 2: VERIFY OTP → LOGIN
// =======================
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ error: "Phone and OTP are required" });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({ error: "User not found. Please request OTP first." });
    }

    // Check OTP match
    if (user.otp !== otp) {
      return res.status(401).json({ error: "Invalid OTP. Please try again." });
    }

    // Check OTP expiry
    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      return res.status(401).json({ error: "OTP has expired. Please request a new one." });
    }

    // ✅ Clear OTP after successful use (one-time use)
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });

  } catch (err) {
    console.error("Verify OTP Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// =======================
// ✅ GET ALL USERS (for assignment dropdown)
// =======================
router.get("/", protect, allowRoles("super_admin", "manager"), async (req, res) => {
  try {
    const users = await User.find().select("name phone role").lean();
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
      const { name, phone, role } = req.body;

      if (!phone) return res.status(400).json({ error: "Phone required" });

      // manager can only create users, not managers or admins
      if (req.user.role === "manager" && role !== "user") {
        return res.status(403).json({ error: "Manager can only create users" });
      }

      // Check contact exists, auto-create if not
      const contact = await Contact.findOne({ mobile: phone });
      if (!contact) {
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