// routes/uploadRoutes.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });

// Upload endpoint
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  res.json({
    fileUrl,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    messageType: req.file.mimetype.startsWith("image/") ? "image" : "file"
  });
});

module.exports = router;