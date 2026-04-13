const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    name: { type: String, default: "UNKNOWN" },
    mobile: { type: String, required: true, unique: true },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
    source: { type: String, enum: ["ORGANIC", "IMPORTED", "MANUAL"], default: "MANUAL" },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", ContactSchema);