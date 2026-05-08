const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    name: { type: String, default: "UNKNOWN" },

    mobile: { type: String, required: true, unique: true },

    email: { type: String, default: null }, // ✅ ADD THIS — OTP will be sent here

    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],

    source: {
      type: String,
      enum: ["ORGANIC", "IMPORTED", "MANUAL"],
      default: "MANUAL",
    },

    role: {
      type: String,
      enum: ["super_admin", "manager", "user"],
      default: "user",
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", ContactSchema);