const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const connectDB = require("./config/db");
const { initSocket } = require("./sockets/socket");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Database connection
connectDB();

// Initialize Socket.io
const io = initSocket(server);
app.set("io", io);

// ── Safe route loader ─────────────────────────────────────────
function safeRequire(routePath) {
  try {
    const route = require(routePath);
    if (typeof route !== "function" && typeof route !== "object") {
      console.error(`❌ Invalid export from ${routePath}`);
      return null;
    }
    return route;
  } catch (err) {
    console.error(`❌ Failed to load route ${routePath}:`, err.message);
    return null;
  }
}

const messageRoutes  = safeRequire("./routes/messageRoutes");
const chatRoutes     = safeRequire("./routes/chatRoutes");
const userRoutes     = safeRequire("./routes/userRoutes");
const contactRoutes  = safeRequire("./routes/contactRoutes");
const uploadRoutes   = safeRequire("./routes/uploadRoutes");
const groupRoutes    = safeRequire("./routes/groupRoutes");
const templateRoutes = safeRequire("./routes/templateRoutes");
const campaignRoutes = safeRequire("./routes/campaignRoutes");
const tagRoutes      = safeRequire("./routes/tagRoutes");

// ── Mount routes (only if loaded successfully) ────────────────
if (messageRoutes)  app.use("/api/messages", messageRoutes);
if (chatRoutes)     app.use("/api/chats",    chatRoutes);
if (userRoutes)     app.use("/api/users",    userRoutes);
if (contactRoutes)  app.use("/api",          contactRoutes);
if (uploadRoutes)   app.use("/api/upload",   uploadRoutes);
if (templateRoutes) app.use("/api",          templateRoutes);
if (campaignRoutes) app.use("/api",          campaignRoutes);
if (tagRoutes)      app.use("/api",          tagRoutes);
if (groupRoutes)    app.use("/api/groups",   groupRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

// ── Start cron jobs ───────────────────────────────────────────
try {
  require("./jobs/scheduler");
  console.log("✅ scheduler loaded");
} catch (err) {
  console.error("❌ scheduler failed:", err.message);
}

try {
  require("./jobs/campaignScheduler");
  console.log("✅ campaignScheduler loaded");
} catch (err) {
  console.error("❌ campaignScheduler failed:", err.message);
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});