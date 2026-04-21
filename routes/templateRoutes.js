const express = require("express");
const multer = require("multer");
const Template = require("../models/Template");
const cloudinary = require("../config/cloudinary");

const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

const safeParse = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return value; }
};

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
// ✅ GET PENDING APPROVALS (super_admin only)
// =======================
router.get(
  "/templates/pending",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const templates = await Template.find({ approvalStatus: "pending_approval" })
        .populate("createdBy", "name phone role")
        .sort({ createdAt: -1 });
      res.json({ success: true, templates });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);


// =======================
// ✅ APPROVE TEMPLATE (super_admin only)
// =======================
router.put(
  "/templates/:id/approve",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const template = await Template.findByIdAndUpdate(
        req.params.id,
        { approvalStatus: "approved", status: "APPROVED" },
        { new: true }
      ).populate("createdBy", "name phone role");

      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json({ success: true, template });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);


// =======================
// ✅ REJECT TEMPLATE (super_admin only)
// =======================
router.put(
  "/templates/:id/reject",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const template = await Template.findByIdAndUpdate(
        req.params.id,
        { approvalStatus: "rejected", status: "REJECTED" },
        { new: true }
      ).populate("createdBy", "name phone role");

      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json({ success: true, template });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);


// =======================
// ✅ GET ALL TEMPLATES
// =======================
router.get(
  "/templates",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      let filter = {};

      // ✅ Manager sees only their own templates
      if (req.user.role === "manager") {
        filter.createdBy = req.user.id;
      }

      const templates = await Template.find(filter)
        .populate("createdBy", "name phone role")
        .sort({ createdAt: -1 });

      res.json({ success: true, templates });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);


// =======================
// ✅ CREATE TEMPLATE
// =======================
router.post(
  "/templates",
  protect,
  allowRoles("super_admin", "manager"),
  upload.single("mediaFile"),
  async (req, res) => {
    try {
      const { name, category, language, type, format, footer, actionType, mediaType } = req.body;

      if (!name || !category || !format) {
        return res.status(400).json({ error: "Missing required fields: name, category, format" });
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

      if (imageFile?.type) { imageFile.mimeType = imageFile.type; delete imageFile.type; }
      if (videoFile?.type) { videoFile.mimeType = videoFile.type; delete videoFile.type; }
      carouselItems = carouselItems.map((item) => { if (item.mediaType) { item.mimeType = item.mediaType; delete item.mediaType; } return item; });
      ctaButtons = ctaButtons.map((btn) => ({ ...btn, btnType: btn.type, type: undefined }));

      if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer);
        if (mediaType === "Image") imageFile = { name: req.file.originalname, mimeType: req.file.mimetype, url: result.secure_url };
        else if (mediaType === "Video") videoFile = { name: req.file.originalname, mimeType: req.file.mimetype, url: result.secure_url };
      }

      // ✅ Manager templates need admin approval, admin templates are auto-approved
      const approvalStatus = req.user.role === "super_admin" ? "approved" : "pending_approval";

      const template = new Template({
        name, category,
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
        approvalStatus,
        createdBy: req.user.id, // ✅ from token
      });

      await template.save();

      res.status(201).json({
        success: true,
        message: req.user.role === "manager"
          ? "Template submitted for admin approval"
          : "Template created successfully",
        template,
        pendingApproval: approvalStatus === "pending_approval",
      });
    } catch (error) {
      console.error("Template creation error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);


// =======================
// ✅ GET SINGLE TEMPLATE
// =======================
router.get(
  "/templates/:id",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const template = await Template.findById(req.params.id)
        .populate("createdBy", "name phone role");

      if (!template) return res.status(404).json({ error: "Template not found" });

      // ✅ Manager can only view their own template
      if (req.user.role === "manager" && template.createdBy._id.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      res.json({ success: true, template });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);


// =======================
// ✅ UPDATE TEMPLATE
// =======================
router.put(
  "/templates/:id",
  protect,
  allowRoles("super_admin", "manager"),
  upload.single("mediaFile"),
  async (req, res) => {
    try {
      const templateId = req.params.id;
      const existing = await Template.findById(templateId);

      if (!existing) return res.status(404).json({ error: "Template not found" });

      // ✅ Manager can only edit their own templates
      if (req.user.role === "manager" && existing.createdBy.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { name, category, language, type, format, footer, actionType, mediaType } = req.body;

      let imageFile = safeParse(req.body.imageFile);
      let videoFile = safeParse(req.body.videoFile);
      let carouselItems = safeParse(req.body.carouselItems) || [];
      let ctaButtons = safeParse(req.body.ctaButtons) || [];
      let quickReplies = safeParse(req.body.quickReplies) || [];
      let copyCodeButtons = safeParse(req.body.copyCodeButtons) || [];
      let dropdownButtons = safeParse(req.body.dropdownButtons) || [];
      let inputFields = safeParse(req.body.inputFields) || [];
      let variables = safeParse(req.body.variables) || {};

      if (imageFile?.type) { imageFile.mimeType = imageFile.type; delete imageFile.type; }
      if (videoFile?.type) { videoFile.mimeType = videoFile.type; delete videoFile.type; }
      carouselItems = carouselItems.map((item) => { if (item.mediaType) { item.mimeType = item.mediaType; delete item.mediaType; } return item; });
      ctaButtons = ctaButtons.map((btn) => ({ ...btn, btnType: btn.type, type: undefined }));

      if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer);
        if (mediaType === "Image") imageFile = { name: req.file.originalname, mimeType: req.file.mimetype, url: result.secure_url };
        else if (mediaType === "Video") videoFile = { name: req.file.originalname, mimeType: req.file.mimetype, url: result.secure_url };
      } else {
        if (mediaType === "Image") imageFile = existing.imageFile;
        if (mediaType === "Video") videoFile = existing.videoFile;
      }

      // ✅ Manager edits go back to pending approval
      const approvalStatus = req.user.role === "manager" ? "pending_approval" : existing.approvalStatus;

      const updated = await Template.findByIdAndUpdate(
        templateId,
        {
          name, category,
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
          approvalStatus, // ✅ manager edits reset to pending
          updatedAt: Date.now(),
        },
        { new: true }
      ).populate("createdBy", "name phone role");

      res.json({
        success: true,
        template: updated,
        pendingApproval: approvalStatus === "pending_approval",
      });
    } catch (error) {
      console.error("Template update error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);


// =======================
// ✅ DELETE TEMPLATE (super_admin only)
// =======================
router.delete(
  "/templates/:id",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const deleted = await Template.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Template not found" });
      res.json({ success: true, message: "Template deleted" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);


module.exports = router;