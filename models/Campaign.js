const mongoose = require("mongoose");

const CampaignSchema = new mongoose.Schema(
  {
    campaignName: { type: String, required: true, trim: true },

    messageType: {
      type: String,
      enum: ["Pre-approved template message", "Custom message"],
      default: "Pre-approved template message",
    },

    // ✅ FIXED ENUM
    audienceType: {
      type: String,
      enum: ["tags", "contact", "group", "manual"],
      required: true,
      default: "tags",
    },

    // ✅ ALL TARGET TYPES
    tagIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
    contactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Contact" }],
    groupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
    manualNumbers: [{ type: String, trim: true }],

    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Template",
      default: null,
    },

    scheduledDateTime: { type: Date },

    recurrence: {
      type: {
        type: String,
        enum: ["one-time", "daily", "weekly", "monthly", "hourly"],
        default: "one-time",
      },
      interval: { type: Number, default: 1 },
      dayOfWeek: { type: Number, min: 0, max: 6 },
      dayOfMonth: { type: Number, min: 1, max: 31 },
      hour: { type: Number, min: 0, max: 23 },
    },

    // ✅ FIX NAME
    variableValues: { type: Object, default: {} },

    messagePreview: { type: String, default: "" },

    status: {
      type: String,
      enum: [
  "draft",
  "scheduled",
  "active",
  "paused",
  "processing",
  "sent",
  "completed", // ✅ ADD THIS
  "failed",
  "cancelled",
],
      default: "scheduled",
    },

    nextRun: { type: Date },

    createdBy: { type: String, required: true },

    sentCount: { type: Number, default: 0 },
    errorLog: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Campaign", CampaignSchema);