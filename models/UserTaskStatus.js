const mongoose = require("mongoose");

const userTaskStatusSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
  status: {
    type: String,
    enum: ["pending", "in_progress", "completed", "cancelled"],
    default: "pending",
  },
});

userTaskStatusSchema.index({ userId: 1, taskId: 1 }, { unique: true });

module.exports = mongoose.model("UserTaskStatus", userTaskStatusSchema);