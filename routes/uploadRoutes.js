const express = require("express");
const multer = require("multer");
const router = express.Router();
const cloudinary = require("../config/cloudinary");

// ✅ Use memory storage (not disk)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 🔥 Upload endpoint (Cloudinary)
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;

    // 🔥 Upload to Cloudinary
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto", // supports image, video, pdf etc.
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary Error:", error);
          return res.status(500).json({ error: "Upload failed" });
        }

        // ✅ Return cloud URL
        res.json({
          fileUrl: result.secure_url,
          fileName: file.originalname,
          fileSize: file.size,
          messageType: file.mimetype.startsWith("image/")
            ? "image"
            : file.mimetype.startsWith("video/")
            ? "video"
            : "file",
        });
      }
    );

    // 🔥 Send file buffer to cloudinary
    stream.end(file.buffer);

  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;