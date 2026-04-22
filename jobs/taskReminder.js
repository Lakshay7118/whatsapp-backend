const cron = require("node-cron");
const Task = require("../models/Task");
const Notification = require("../models/Notification");
const { getIO } = require("../sockets/socket");

async function sendReminders() {
  const now = new Date();
  const tasks = await Task.find({
    reminderAt: { $lte: now },
    status: { $ne: "completed" },
  }).populate("assignedTo", "_id");

  if (tasks.length === 0) return;

  const io = getIO();

  for (const task of tasks) {
    for (const user of task.assignedTo) {
      const notif = await Notification.create({
        userId: user._id,
        type: "task_reminder",
        message: `Reminder: Task "${task.title}" is due soon.`,
        taskId: task._id,
      });
      io.to(user._id.toString()).emit("newNotification", notif);
      io.to(user._id.toString()).emit("taskReminder", {
        taskId: task._id,
        title: task.title,
        dueDate: task.dueDate,
      });
    }

    // Clear reminder to prevent repeats
    task.reminderAt = null;
    await task.save();
  }
}

cron.schedule("* * * * *", () => {
  sendReminders().catch(console.error);
});

module.exports = { sendReminders };