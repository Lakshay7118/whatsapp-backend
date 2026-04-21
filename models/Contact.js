const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    name: { type: String, default: "UNKNOWN" },

    mobile: { type: String, required: true, unique: true },

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

    // ✅ NEW — approval system
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // ✅ FIXED — changed from String to ObjectId so we can populate name/role
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", ContactSchema);