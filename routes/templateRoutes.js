const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Template = require("../models/Template");

const router = express.Router();

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/templates");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

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

// POST /api/templates – create a new template
router.post("/templates", upload.single("mediaFile"), async (req, res) => {
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

    // Validate required fields
    if (!name || !category || !format || !createdBy) {
      return res.status(400).json({ error: "Missing required fields: name, category, format, createdBy" });
    }

    // Parse JSON fields (sent as strings)
    let imageFile = safeParse(req.body.imageFile);
    let videoFile = safeParse(req.body.videoFile);
    let carouselItems = safeParse(req.body.carouselItems) || [];
    let ctaButtons = safeParse(req.body.ctaButtons) || [];
    let quickReplies = safeParse(req.body.quickReplies) || [];
    let copyCodeButtons = safeParse(req.body.copyCodeButtons) || [];
    let dropdownButtons = safeParse(req.body.dropdownButtons) || [];
    let inputFields = safeParse(req.body.inputFields) || [];
    let variables = safeParse(req.body.variables) || {};  // ✅ ADDED

    // Transform fields to match the schema
    if (imageFile && imageFile.type) {
      imageFile.mimeType = imageFile.type;
      delete imageFile.type;
    }
    if (videoFile && videoFile.type) {
      videoFile.mimeType = videoFile.type;
      delete videoFile.type;
    }

    carouselItems = carouselItems.map(item => {
      if (item.mediaType) {
        item.mimeType = item.mediaType;
        delete item.mediaType;
      }
      return item;
    });

    ctaButtons = ctaButtons.map(btn => ({
      ...btn,
      btnType: btn.type,
      type: undefined,
    }));

    // Handle uploaded media file
    if (req.file) {
      const fileUrl = `/uploads/templates/${req.file.filename}`;
      if (mediaType === "Image") {
        imageFile = {
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          url: fileUrl,
        };
      } else if (mediaType === "Video") {
        videoFile = {
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          url: fileUrl,
        };
      }
    }

    // Build the final document
    const templateData = {
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
      variables,        // ✅ ADDED
      status: "DRAFT",
      createdBy,
    };

    const template = new Template(templateData);
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

// GET all templates
router.get("/templates", async (req, res) => {
  try {
    const templates = await Template.find().sort({ createdAt: -1 });
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/templates/:id
router.put("/templates/:id", upload.single("mediaFile"), async (req, res) => {
  try {
    const templateId = req.params.id;
    const existing = await Template.findById(templateId);
    if (!existing) return res.status(404).json({ error: "Template not found" });

    const { name, category, language, type, format, footer, actionType, mediaType, createdBy } = req.body;

    let imageFile = safeParse(req.body.imageFile);
    let videoFile = safeParse(req.body.videoFile);
    let carouselItems = safeParse(req.body.carouselItems) || [];
    let ctaButtons = safeParse(req.body.ctaButtons) || [];
    let quickReplies = safeParse(req.body.quickReplies) || [];
    let copyCodeButtons = safeParse(req.body.copyCodeButtons) || [];
    let dropdownButtons = safeParse(req.body.dropdownButtons) || [];
    let inputFields = safeParse(req.body.inputFields) || [];
    let variables = safeParse(req.body.variables) || {};  // ✅ ADDED

    // transform fields same as POST
    if (imageFile && imageFile.type) { imageFile.mimeType = imageFile.type; delete imageFile.type; }
    if (videoFile && videoFile.type) { videoFile.mimeType = videoFile.type; delete videoFile.type; }

    carouselItems = carouselItems.map(item => {
      if (item.mediaType) { item.mimeType = item.mediaType; delete item.mediaType; }
      return item;
    });

    ctaButtons = ctaButtons.map(btn => ({ ...btn, btnType: btn.type, type: undefined }));

    if (req.file) {
      const fileUrl = `/uploads/templates/${req.file.filename}`;
      if (mediaType === "Image") imageFile = { name: req.file.originalname, mimeType: req.file.mimetype, url: fileUrl };
      else if (mediaType === "Video") videoFile = { name: req.file.originalname, mimeType: req.file.mimetype, url: fileUrl };
    } else {
      if (mediaType === "Image" && existing.imageFile) imageFile = existing.imageFile;
      if (mediaType === "Video" && existing.videoFile) videoFile = existing.videoFile;
    }

    const updateData = {
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
      variables,        // ✅ ADDED
      updatedAt: Date.now(),
    };

    const updated = await Template.findByIdAndUpdate(templateId, updateData, { new: true });
    res.json({ success: true, template: updated });
  } catch (error) {
    console.error("Template update error:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET single template
router.get("/templates/:id", async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE template
router.delete("/templates/:id", async (req, res) => {
  try {
    const deleted = await Template.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Template not found" });
    res.json({ success: true, message: "Template deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;