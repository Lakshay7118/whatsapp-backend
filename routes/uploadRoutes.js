const express = require("express");
const multer = require("multer");
const router = express.Router();
const cloudinary = require("../config/cloudinary");

// ✅ Use memory storage
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// 🔥 Upload endpoint
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const isImage = file.mimetype.startsWith("image/");
    const isVideo = file.mimetype.startsWith("video/");

    // ✅ Extra safety check
    if (file.size > 50 * 1024 * 1024) {
      return res.status(400).json({
        error: "File too large. Maximum allowed size is 50MB.",
      });
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: isVideo ? "video" : "auto",
        folder: "chat_uploads",
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary Error:", error);

          return res.status(error.http_code || 500).json({
            error:
              error.http_code === 413
                ? "File too large for upload. Please upload a smaller video."
                : "Upload failed",
            details: error.message,
          });
        }

        return res.json({
          fileUrl: result.secure_url,
          fileName: file.originalname,
          fileSize: file.size,
          messageType: isImage ? "image" : isVideo ? "video" : "file",
        });
      }
    );

    stream.end(file.buffer);
  } catch (err) {
    console.error("❌ Upload Error:", err);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// ✅ Multer file size error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File too large. Maximum allowed size is 50MB.",
      });
    }
  }
  next(err);
});

module.exports = router;