// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const User = require("../models/Users");

// LOGIN / REGISTER
router.post("/login", async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: "Missing fields" });
    }

    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({ name, phone });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;