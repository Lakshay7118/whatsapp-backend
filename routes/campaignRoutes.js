const express = require("express");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");

const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const router = express.Router();

// =======================
// ✅ Helper: Next Run
// =======================
function computeNextRun(recurrence, baseDate = new Date()) {
  const next = new Date(baseDate);

  switch (recurrence.type) {
    case "daily":
      next.setDate(next.getDate() + recurrence.interval);
      break;

    case "weekly":
      next.setDate(next.getDate() + 7 * recurrence.interval);
      if (recurrence.dayOfWeek !== undefined) {
        const currentDay = next.getDay();
        const diff = (recurrence.dayOfWeek - currentDay + 7) % 7;
        next.setDate(next.getDate() + diff);
      }
      break;

    case "monthly":
      next.setMonth(next.getMonth() + recurrence.interval);
      if (recurrence.dayOfMonth) {
        next.setDate(recurrence.dayOfMonth);
      }
      break;

    case "hourly":
      next.setHours(next.getHours() + recurrence.interval);
      break;

    default:
      return null;
  }

  return next;
}

// =======================
// ✅ GET PENDING APPROVALS (super_admin only)
// =======================
router.get(
  "/campaigns/pending",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const campaigns = await Campaign.find({ approvalStatus: "pending_approval" })
        .populate("createdBy", "name phone role")
        .populate("templateId", "name")
        .sort({ createdAt: -1 });
      res.json({ success: true, campaigns });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// ✅ APPROVE CAMPAIGN (super_admin only)
// =======================
router.put(
  "/campaigns/:id/approve",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const campaign = await Campaign.findByIdAndUpdate(
        req.params.id,
        { approvalStatus: "approved", status: "scheduled" },
        { new: true }
      ).populate("createdBy", "name phone role");

      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      res.json({ success: true, campaign });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// ✅ REJECT CAMPAIGN (super_admin only)
// =======================
router.put(
  "/campaigns/:id/reject",
  protect,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const campaign = await Campaign.findByIdAndUpdate(
        req.params.id,
        { approvalStatus: "rejected", status: "cancelled" },
        { new: true }
      ).populate("createdBy", "name phone role");

      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      res.json({ success: true, campaign });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// ✅ GET ALL CAMPAIGNS
// =======================
router.get(
  "/campaigns",
  protect,
  allowRoles("super_admin", "manager", "user"),
  async (req, res) => {
    try {
      let filter = {};

      // ✅ Manager sees only their own campaigns
      if (req.user.role === "manager") {
        filter.createdBy = req.user.id;
      }

      const campaigns = await Campaign.find(filter)
        .populate("createdBy", "name phone role")
        .populate("templateId", "name")
        .sort({ createdAt: -1 });

      res.json({ success: true, campaigns });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// ✅ GET SINGLE CAMPAIGN
// =======================
router.get(
  "/campaigns/:id",
  protect,
  allowRoles("super_admin", "manager", "user"),
  async (req, res) => {
    try {
      const campaign = await Campaign.findById(req.params.id)
        .populate("createdBy", "name phone role")
        .populate("templateId", "name");

      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      // ✅ Manager can only view their own campaign
      if (req.user.role === "manager" && campaign.createdBy._id.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      res.json({ success: true, campaign });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// ✅ CREATE CAMPAIGN
// =======================
router.post(
  "/campaigns",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const {
        campaignName,
        messageType,
        audienceType,
        tagIds,
        contactIds,
        groupIds,
        manualNumbers,
        templateId,
        scheduledDateTime,
        recurrence,
        variableValues: requestVariableValues,
        messagePreview,
      } = req.body;

      if (!campaignName) {
        return res.status(400).json({ error: "campaignName is required" });
      }

      if (!["tags", "contact", "group", "manual"].includes(audienceType)) {
        return res.status(400).json({ error: "Invalid audienceType" });
      }

      // ✅ audience validation
      if (audienceType === "tags" && (!tagIds || tagIds.length === 0)) {
        return res.status(400).json({ error: "Select at least one tag" });
      }

      if (audienceType === "contact" && (!contactIds || contactIds.length === 0)) {
        return res.status(400).json({ error: "Select at least one contact" });
      }

      if (audienceType === "group" && (!groupIds || groupIds.length === 0)) {
        return res.status(400).json({ error: "Select at least one group" });
      }

      if (audienceType === "manual" && (!manualNumbers || manualNumbers.length === 0)) {
        return res.status(400).json({ error: "Enter manual numbers" });
      }

      let nextRun = null;
      const recurrenceObj = recurrence || { type: "one-time" };

      if (recurrenceObj.type === "one-time") {
        const scheduledDate = new Date(scheduledDateTime);
        if (isNaN(scheduledDate)) {
          return res.status(400).json({ error: "Invalid date" });
        }
        nextRun = scheduledDate;
      } else {
        nextRun = computeNextRun(recurrenceObj, new Date());
      }

      // 🔥 Merge template variables
      let finalVariableValues = requestVariableValues || {};

      if (templateId) {
        const Template = require("../models/Template");
        const template = await Template.findById(templateId).lean();

        if (template && template.variables) {
          for (const [key, varDef] of Object.entries(template.variables)) {
            if (!finalVariableValues[key]) {
              finalVariableValues[key] = {
                type: varDef.type,
                value: varDef.value || "",
              };
            } else {
              finalVariableValues[key].type = varDef.type;
              if (!finalVariableValues[key].value) {
                finalVariableValues[key].value = varDef.value || "";
              }
            }
          }
        }
      }

      // ✅ Manager campaigns need admin approval, admin campaigns are auto-approved
      const approvalStatus = req.user.role === "super_admin" ? "approved" : "pending_approval";

      const campaign = new Campaign({
        campaignName,
        messageType,
        audienceType,
        tagIds: tagIds || [],
        contactIds: contactIds || [],
        groupIds: groupIds || [],
        manualNumbers: manualNumbers || [],
        templateId,
        scheduledDateTime: nextRun,
        recurrence: recurrenceObj,
        variableValues: finalVariableValues,
        messagePreview,
        createdBy: req.user.id,
        status: req.user.role === "super_admin" ? "scheduled" : "draft",
        approvalStatus,
        nextRun,
      });

      await campaign.save();

      res.status(201).json({
        success: true,
        message: req.user.role === "manager"
          ? "Campaign submitted for admin approval"
          : "Campaign created successfully",
        campaign,
        pendingApproval: approvalStatus === "pending_approval",
      });
    } catch (error) {
      console.error("Campaign creation error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// ✅ UPDATE CAMPAIGN
// =======================
router.put(
  "/campaigns/:id",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const campaignId = req.params.id;
      const existing = await Campaign.findById(campaignId);

      if (!existing) return res.status(404).json({ error: "Campaign not found" });

      // ✅ Manager can only edit their own campaigns
      if (req.user.role === "manager" && existing.createdBy.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const {
        campaignName,
        messageType,
        audienceType,
        tagIds,
        contactIds,
        groupIds,
        manualNumbers,
        templateId,
        scheduledDateTime,
        recurrence,
        variableValues: requestVariableValues,
        messagePreview,
      } = req.body;

      // Validate audience
      if (audienceType === "tags" && (!tagIds || tagIds.length === 0)) {
        return res.status(400).json({ error: "Select at least one tag" });
      }
      if (audienceType === "contact" && (!contactIds || contactIds.length === 0)) {
        return res.status(400).json({ error: "Select at least one contact" });
      }
      if (audienceType === "group" && (!groupIds || groupIds.length === 0)) {
        return res.status(400).json({ error: "Select at least one group" });
      }
      if (audienceType === "manual" && (!manualNumbers || manualNumbers.length === 0)) {
        return res.status(400).json({ error: "Enter manual numbers" });
      }

      let nextRun = existing.nextRun;
      const recurrenceObj = recurrence || existing.recurrence || { type: "one-time" };

      if (recurrenceObj.type === "one-time" && scheduledDateTime) {
        const scheduledDate = new Date(scheduledDateTime);
        if (!isNaN(scheduledDate)) nextRun = scheduledDate;
      } else if (recurrenceObj.type !== "one-time") {
        nextRun = computeNextRun(recurrenceObj, new Date());
      }

      // Merge variables
      let finalVariableValues = requestVariableValues || existing.variableValues || {};
      if (templateId) {
        const Template = require("../models/Template");
        const template = await Template.findById(templateId).lean();
        if (template && template.variables) {
          for (const [key, varDef] of Object.entries(template.variables)) {
            if (!finalVariableValues[key]) {
              finalVariableValues[key] = { type: varDef.type, value: varDef.value || "" };
            } else {
              finalVariableValues[key].type = varDef.type;
            }
          }
        }
      }

      // ✅ Manager edits go back to pending approval
      const approvalStatus = req.user.role === "manager" ? "pending_approval" : existing.approvalStatus;

      const updated = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          campaignName: campaignName || existing.campaignName,
          messageType: messageType || existing.messageType,
          audienceType: audienceType || existing.audienceType,
          tagIds: tagIds || existing.tagIds,
          contactIds: contactIds || existing.contactIds,
          groupIds: groupIds || existing.groupIds,
          manualNumbers: manualNumbers || existing.manualNumbers,
          templateId: templateId || existing.templateId,
          scheduledDateTime: nextRun,
          recurrence: recurrenceObj,
          variableValues: finalVariableValues,
          messagePreview: messagePreview || existing.messagePreview,
          approvalStatus,
          status: req.user.role === "manager" ? "draft" : existing.status,
          nextRun,
        },
        { new: true }
      ).populate("createdBy", "name phone role");

      res.json({
        success: true,
        campaign: updated,
        pendingApproval: approvalStatus === "pending_approval",
      });
    } catch (error) {
      console.error("Campaign update error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// ✅ DELETE CAMPAIGN
// =======================
router.delete(
  "/campaigns/:id",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const campaign = await Campaign.findById(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // ✅ Manager can only delete their own campaigns
      if (req.user.role === "manager" && campaign.createdBy.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await Campaign.findByIdAndDelete(req.params.id);

      res.json({ success: true, message: "Campaign deleted" });
    } catch (error) {
      console.error("Delete campaign error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// ✅ UPDATE STATUS (pause/resume)
// =======================
router.patch(
  "/campaigns/:id/status",
  protect,
  allowRoles("super_admin", "manager"),
  async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ["active", "paused", "scheduled", "sent", "cancelled"];

      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const campaign = await Campaign.findById(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // ✅ Manager can only update status of their own campaigns
      if (req.user.role === "manager" && campaign.createdBy.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      campaign.status = status;

      if (status === "scheduled" || status === "active") {
        if (!campaign.nextRun || new Date(campaign.nextRun) < new Date()) {
          if (campaign.recurrence && campaign.recurrence.type !== "one-time") {
            campaign.nextRun = computeNextRun(campaign.recurrence, new Date());
          }
        }
      }

      await campaign.save();

      res.json({ success: true, campaign });
    } catch (error) {
      console.error("Update campaign status error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;