const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, sparse: true }, // sparse allows null/missing
  password: String,

  phone: { type: String, unique: true, sparse: true }, // ✅ ADD THIS

  role: {
    type: String,
    enum: ["super_admin", "manager", "user"],
    default: "user",
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);