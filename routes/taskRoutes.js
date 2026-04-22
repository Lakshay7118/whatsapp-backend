const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const Notification = require("../models/Notification");
const User = require("../models/Users");
const { getIO } = require("../sockets/socket");

const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

// =======================
// ✅ GET ALL USERS (for assign dropdown)
// =======================
router.get("/users", protect, allowRoles("super_admin", "manager"), async (req, res) => {
  try {
    const users = await User.find().select("name phone role").lean();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ GET TASKS (filtered by role)
// =======================
router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let filter = {};

    if (userRole === "super_admin") {
      filter = {};
    } else if (userRole === "manager") {
      filter = {
        $or: [{ createdBy: userId }, { assignedTo: userId }],
      };
    } else {
      filter = { assignedTo: userId };
    }

    const tasks = await Task.find(filter)
      .populate("createdBy", "name phone role")
      .populate("assignedTo", "name phone role")
      .populate("responses.userId", "name phone role")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ CREATE TASK (super_admin only)
// =======================
router.post("/", protect, allowRoles("super_admin"), async (req, res) => {
  try {
    const {
      title,
      description,
      assignedTo,
      dueDate,
      reminderAt,
      priority,
      attachments,
      isPersonal,
      inputFields,
      dropdownButtons,
      quickReplies,
      ctaButtons,
      checkboxes,                     // ✅ NEW
    } = req.body;

    if (!title || !dueDate) {
      return res.status(400).json({ error: "Title and dueDate are required" });
    }

    let assignedUserIds = assignedTo || [];
    if (isPersonal) {
      assignedUserIds = [req.user.id];
    }

    const task = new Task({
      title,
      description,
      createdBy: req.user.id,
      assignedTo: assignedUserIds,
      isPersonal: isPersonal || false,
      dueDate,
      reminderAt: reminderAt || null,
      priority: priority || "medium",
      attachments: attachments || [],
      inputFields: inputFields || [],
      dropdownButtons: dropdownButtons || [],
      quickReplies: quickReplies || [],
      ctaButtons: ctaButtons || [],
      checkboxes: checkboxes || [],   // ✅ NEW
    });

    await task.save();
    await task.populate("createdBy", "name phone role");
    await task.populate("assignedTo", "name phone role");

    const io = getIO();

    // Create notifications for assigned users
    for (const uid of assignedUserIds) {
      const notif = await Notification.create({
        userId: uid,
        type: "task_assigned",
        message: `New task assigned: ${task.title}`,
        taskId: task._id,
      });
      io.to(uid.toString()).emit("newNotification", notif);
      io.to(uid.toString()).emit("newTask", task);
    }

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ UPDATE TASK (super_admin or creator)
// =======================
router.put("/:id", protect, allowRoles("super_admin", "manager"), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const isCreator = task.createdBy.toString() === req.user.id;
    const isAdmin = req.user.role === "super_admin";
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const allowedUpdates = [
      "title", "description", "dueDate", "reminderAt", "priority",
      "attachments", "inputFields", "dropdownButtons", "quickReplies",
      "ctaButtons", "checkboxes",        // ✅ NEW
    ];
    const updates = {};
    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const updatedTask = await Task.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate("createdBy", "name phone role")
      .populate("assignedTo", "name phone role")
      .populate("responses.userId", "name phone role");

    const io = getIO();
    updatedTask.assignedTo.forEach((user) => {
      io.to(user._id.toString()).emit("taskUpdated", updatedTask);
    });
    io.to(updatedTask.createdBy._id.toString()).emit("taskUpdated", updatedTask);

    res.json({ success: true, data: updatedTask });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ DELETE TASK (super_admin only)
// =======================
router.delete("/:id", protect, allowRoles("super_admin"), async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    await Notification.deleteMany({ taskId: req.params.id });

    const io = getIO();
    [...task.assignedTo, task.createdBy].forEach((uid) => {
      if (uid) io.to(uid.toString()).emit("taskDeleted", { taskId: task._id });
    });

    res.json({ success: true, message: "Task deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ SUBMIT RESPONSE (assigned users)
// =======================
router.post("/:id/response", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const isAssignee = task.assignedTo.some((id) => id.toString() === req.user.id);
    const isCreator = task.createdBy.toString() === req.user.id;
    const isAdmin = req.user.role === "super_admin";
    if (!isAssignee && !isCreator && !isAdmin) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const { message, formData } = req.body;

    // Ensure formData includes checkboxSelections
    const safeFormData = {
      inputFields: formData?.inputFields || [],
      dropdownSelections: formData?.dropdownSelections || [],
      quickReplySelected: formData?.quickReplySelected || "",
      checkboxSelections: formData?.checkboxSelections || [],   // ✅ NEW
    };

    const response = {
      userId: req.user.id,
      message: message || "",
      formData: safeFormData,
      createdAt: new Date(),
    };

    task.responses.push(response);
    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate("createdBy", "name phone role")
      .populate("assignedTo", "name phone role")
      .populate("responses.userId", "name phone role");

    const io = getIO();

    // Notify creator
    const notif = await Notification.create({
      userId: task.createdBy,
      type: "response_received",
      message: `${req.user.name} responded to task "${task.title}"`,
      taskId: task._id,
    });
    io.to(task.createdBy.toString()).emit("newNotification", notif);
    io.to(task.createdBy.toString()).emit("taskResponse", populatedTask);

    // Notify other assignees
    task.assignedTo.forEach((uid) => {
      if (uid.toString() !== req.user.id) {
        io.to(uid.toString()).emit("taskUpdated", populatedTask);
      }
    });

    res.json({ success: true, data: populatedTask });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ UPDATE TASK STATUS
// =======================
router.patch("/:id/status", protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const isAssignee = task.assignedTo.some((id) => id.toString() === req.user.id);
    const isCreator = task.createdBy.toString() === req.user.id;
    const isAdmin = req.user.role === "super_admin";
    if (!isAssignee && !isCreator && !isAdmin) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const { status } = req.body;
    const validStatuses = ["pending", "in_progress", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    task.status = status;
    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate("createdBy", "name phone role")
      .populate("assignedTo", "name phone role")
      .populate("responses.userId", "name phone role");

    const io = getIO();
    const recipients = [task.createdBy.toString(), ...task.assignedTo.map((id) => id.toString())];
    recipients.forEach((uid) => {
      if (uid !== req.user.id) {
        io.to(uid).emit("taskUpdated", populatedTask);
      }
    });

    res.json({ success: true, data: populatedTask });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ GET NOTIFICATIONS
// =======================
router.get("/notifications", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .populate("taskId", "title")
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ MARK NOTIFICATION READ
// =======================
router.patch("/notifications/:id/read", protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { read: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ MARK ALL NOTIFICATIONS READ
// =======================
router.patch("/notifications/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id }, { read: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;