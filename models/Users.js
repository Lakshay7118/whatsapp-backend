// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  email: String,
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);