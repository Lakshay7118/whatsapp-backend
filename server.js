// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const connectDB = require("./config/db");
const { initSocket } = require("./sockets/socket");

// Routes
const messageRoutes = require("./routes/messageRoutes");
const chatRoutes = require("./routes/chatRoutes");
const userRoutes = require("./routes/userRoutes");
const contactRoutes = require("./routes/contactRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const groupRoutes = require("./routes/groupRoutes");
const templateRoutes = require("./routes/templateRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const tagRoutes = require("./routes/tagRoutes");

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

// Routes
app.use("/api/messages", messageRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/users", userRoutes);
app.use("/api", contactRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api", templateRoutes);
app.use("/api", campaignRoutes);
app.use("/api", tagRoutes); 

app.use("/api/groups", groupRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

// Start cron jobs (if any)

require("./jobs/campaignScheduler");

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});