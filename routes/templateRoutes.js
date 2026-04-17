
const express = require("express");
const multer = require("multer");
const Template = require("../models/Template");
const cloudinary = require("../config/cloudinary");
const protect = require("../middleware/authMiddleware"); // ✅ JWT middleware

const router = express.Router();

// ✅ Use memory storage (not disk)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Helper to safely parse JSON strings from FormData
const safeParse = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

// 🔥 Upload helper (Cloudinary)
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "auto" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
};

// =======================
// ✅ CREATE TEMPLATE
// =======================
router.post("/templates", protect, upload.single("mediaFile"), async (req, res) => {
  try {
    const {
      name,
      category,
      language,
      type,
      format,
      footer,
      actionType,
      mediaType,
      createdBy,
    } = req.body;

    if (!name || !category || !format || !createdBy) {
      return res.status(400).json({
        error: "Missing required fields: name, category, format, createdBy",
      });
    }

    let imageFile = safeParse(req.body.imageFile);
    let videoFile = safeParse(req.body.videoFile);
    let carouselItems = safeParse(req.body.carouselItems) || [];
    let ctaButtons = safeParse(req.body.ctaButtons) || [];
    let quickReplies = safeParse(req.body.quickReplies) || [];
    let copyCodeButtons = safeParse(req.body.copyCodeButtons) || [];
    let dropdownButtons = safeParse(req.body.dropdownButtons) || [];
    let inputFields = safeParse(req.body.inputFields) || [];
    let variables = safeParse(req.body.variables) || {};

    // transform fields
    if (imageFile && imageFile.type) {
      imageFile.mimeType = imageFile.type;
      delete imageFile.type;
    }

    if (videoFile && videoFile.type) {
      videoFile.mimeType = videoFile.type;
      delete videoFile.type;
    }

    carouselItems = carouselItems.map((item) => {
      if (item.mediaType) {
        item.mimeType = item.mediaType;
        delete item.mediaType;
      }
      return item;
    });

    ctaButtons = ctaButtons.map((btn) => ({
      ...btn,
      btnType: btn.type,
      type: undefined,
    }));

    // 🔥 Upload to Cloudinary
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);

      if (mediaType === "Image") {
        imageFile = {
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          url: result.secure_url,
        };
      } else if (mediaType === "Video") {
        videoFile = {
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          url: result.secure_url,
        };
      }
    }

    const template = new Template({
      name,
      category,
      language: language || "English",
      type: type || "Text",
      format,
      footer: footer || "",
      actionType: actionType || "none",
      mediaType: mediaType || "None",
      imageFile: imageFile || null,
      videoFile: videoFile || null,
      carouselItems,
      ctaButtons,
      quickReplies,
      copyCodeButtons,
      dropdownButtons,
      inputFields,
      variables,
      status: "DRAFT",
      createdBy,
    });

    await template.save();

    res.status(201).json({
      success: true,
      message: "Template created successfully",
      template,
    });
  } catch (error) {
    console.error("Template creation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ GET ALL
// =======================
router.get("/templates", protect, async (req, res) => {
  try {
    const templates = await Template.find().sort({ createdAt: -1 });
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ UPDATE TEMPLATE
// =======================
router.put("/templates/:id", protect, upload.single("mediaFile"), async (req, res) => {
  try {
    const templateId = req.params.id;
    const existing = await Template.findById(templateId);
    if (!existing) return res.status(404).json({ error: "Template not found" });

    const {
      name,
      category,
      language,
      type,
      format,
      footer,
      actionType,
      mediaType,
    } = req.body;

    let imageFile = safeParse(req.body.imageFile);
    let videoFile = safeParse(req.body.videoFile);
    let carouselItems = safeParse(req.body.carouselItems) || [];
    let ctaButtons = safeParse(req.body.ctaButtons) || [];
    let quickReplies = safeParse(req.body.quickReplies) || [];
    let copyCodeButtons = safeParse(req.body.copyCodeButtons) || [];
    let dropdownButtons = safeParse(req.body.dropdownButtons) || [];
    let inputFields = safeParse(req.body.inputFields) || [];
    let variables = safeParse(req.body.variables) || {};

    if (imageFile && imageFile.type) {
      imageFile.mimeType = imageFile.type;
      delete imageFile.type;
    }

    if (videoFile && videoFile.type) {
      videoFile.mimeType = videoFile.type;
      delete videoFile.type;
    }

    carouselItems = carouselItems.map((item) => {
      if (item.mediaType) {
        item.mimeType = item.mediaType;
        delete item.mediaType;
      }
      return item;
    });

    ctaButtons = ctaButtons.map((btn) => ({
      ...btn,
      btnType: btn.type,
      type: undefined,
    }));

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);

      if (mediaType === "Image") {
        imageFile = {
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          url: result.secure_url,
        };
      } else if (mediaType === "Video") {
        videoFile = {
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          url: result.secure_url,
        };
      }
    } else {
      if (mediaType === "Image") imageFile = existing.imageFile;
      if (mediaType === "Video") videoFile = existing.videoFile;
    }

    const updated = await Template.findByIdAndUpdate(
      templateId,
      {
        name,
        category,
        language: language || "English",
        type: type || "Text",
        format,
        footer: footer || "",
        actionType: actionType || "none",
        mediaType: mediaType || "None",
        imageFile,
        videoFile,
        carouselItems,
        ctaButtons,
        quickReplies,
        copyCodeButtons,
        dropdownButtons,
        inputFields,
        variables,
        updatedAt: Date.now(),
      },
      { new: true }
    );

    res.json({ success: true, template: updated });
  } catch (error) {
    console.error("Template update error:", error);
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ GET SINGLE
// =======================
router.get("/templates/:id", protect, async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ DELETE
// =======================
router.delete("/templates/:id", protect, async (req, res) => {
  try {
    const deleted = await Template.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true, message: "Template deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
