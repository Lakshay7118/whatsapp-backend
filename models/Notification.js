const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["task_assigned", "response_received", "task_reminder", "status_changed"],
      required: true,
    },
    message: { type: String, required: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", NotificationSchema);