const mongoose = require("mongoose");

const TagSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tag", TagSchema);