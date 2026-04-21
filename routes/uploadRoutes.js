const express = require("express");
const multer = require("multer");
const router = express.Router();

const cloudinary = require("../config/cloudinary");
const protect = require("../middleware/authMiddleware");


// =======================
// ✅ MULTER CONFIG
// =======================
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});


// =======================
// 🔥 ALLOWED TYPES
// =======================
const allowedTypes = [
  "image/",
  "video/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];


// =======================
// 🔥 UPLOAD FILE
// =======================
router.post("/", protect, upload.single("file"), async (req, res) => {
  try {
    const userPhone = req.user.phone;
    const userRole = req.user.role;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;

    // ================= TYPE VALIDATION =================
    const isAllowed = allowedTypes.some(type =>
      file.mimetype.startsWith(type)
    );

    if (!isAllowed) {
      return res.status(400).json({
        error: "File type not allowed",
      });
    }

    const isImage = file.mimetype.startsWith("image/");
    const isVideo = file.mimetype.startsWith("video/");

    // ================= SIZE VALIDATION =================
    if (file.size > 50 * 1024 * 1024) {
      return res.status(400).json({
        error: "File too large. Max 50MB allowed.",
      });
    }

    // ================= CLOUDINARY UPLOAD =================
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: isVideo ? "video" : "auto",
        folder: "chat_uploads",

        // 🔥 TRACK USER + ROLE
        public_id: `${userRole}_${userPhone}_${Date.now()}`,
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary Error:", error);

          return res.status(error.http_code || 500).json({
            error:
              error.http_code === 413
                ? "File too large for upload"
                : "Upload failed",
            details: error.message,
          });
        }

        return res.json({
          fileUrl: result.secure_url,
          fileName: file.originalname,
          fileSize: file.size,
          messageType: isImage
            ? "image"
            : isVideo
            ? "video"
            : "file",

          uploadedBy: userPhone,
          role: userRole, // 🔥 useful for logs/admin
        });
      }
    );

    stream.end(file.buffer);

  } catch (err) {
    console.error("Upload Error:", err);
    return res.status(500).json({
      error: err.message || "Upload failed",
    });
  }
});


// =======================
// ✅ MULTER ERROR HANDLER
// =======================
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File too large. Max 50MB allowed.",
      });
    }
  }
  next(err);
});


module.exports = router;