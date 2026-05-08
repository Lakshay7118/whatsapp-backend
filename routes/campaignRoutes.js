const express = require("express");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");

const protect = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/roleMiddleware");

const router = express.Router();

// =======================
// ✅ Helper: Next Run
// Called ONLY by the scheduler after a campaign fires, to compute the NEXT run.
// Never used for the first run — that comes from the user's scheduledDateTime.
// =======================
function computeNextRun(recurrence, baseDate = new Date()) {
  const interval = recurrence.interval || 1;
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;

  const utcMs = new Date(baseDate).getTime();
  const istDate = new Date(utcMs + IST_OFFSET);

  switch (recurrence.type) {
    case "daily":
      istDate.setDate(istDate.getDate() + interval);
      break;
    case "weekly":
      istDate.setDate(istDate.getDate() + 7 * interval);
      if (recurrence.dayOfWeek !== undefined) {
        const currentDay = istDate.getDay();
        const diff = (recurrence.dayOfWeek - currentDay + 7) % 7;
        istDate.setDate(istDate.getDate() + diff);
      }
      break;
    case "monthly":
      istDate.setMonth(istDate.getMonth() + interval);
      if (recurrence.dayOfMonth) {
        istDate.setDate(recurrence.dayOfMonth);
      }
      break;
    case "hourly":
      istDate.setHours(istDate.getHours() + interval);
      break;
    default:
      return null;
  }

  // Convert back to UTC for MongoDB
  return new Date(istDate.getTime() - IST_OFFSET);
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
      const campaigns = await Campaign.find({
        approvalStatus: "pending_approval",
      })
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

      if (!campaign)
        return res.status(404).json({ error: "Campaign not found" });
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

      if (!campaign)
        return res.status(404).json({ error: "Campaign not found" });
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

      // Manager sees only their own campaigns
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

      if (!campaign)
        return res.status(404).json({ error: "Campaign not found" });

      // Manager can only view their own campaign
      if (
        req.user.role === "manager" &&
        campaign.createdBy._id.toString() !== req.user.id
      ) {
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

      // ── Basic validation ──
      if (!campaignName) {
        return res.status(400).json({ error: "campaignName is required" });
      }

      if (!["tags", "contact", "group", "manual"].includes(audienceType)) {
        return res.status(400).json({ error: "Invalid audienceType" });
      }

      if (audienceType === "tags" && (!tagIds || tagIds.length === 0)) {
        return res.status(400).json({ error: "Select at least one tag" });
      }
      if (
        audienceType === "contact" &&
        (!contactIds || contactIds.length === 0)
      ) {
        return res
          .status(400)
          .json({ error: "Select at least one contact" });
      }
      if (audienceType === "group" && (!groupIds || groupIds.length === 0)) {
        return res.status(400).json({ error: "Select at least one group" });
      }
      if (
        audienceType === "manual" &&
        (!manualNumbers || manualNumbers.length === 0)
      ) {
        return res.status(400).json({ error: "Enter manual numbers" });
      }

      // ── ✅ FIX: Always use user's chosen scheduledDateTime as first run ──
      // computeNextRun is only for the scheduler after a campaign fires.
      if (!scheduledDateTime) {
        return res
          .status(400)
          .json({ error: "scheduledDateTime is required" });
      }

      const scheduledDate = new Date(scheduledDateTime);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: "Invalid scheduledDateTime" });
      }

      const nextRun = scheduledDate; // ✅ first run = exactly what user picked

      // ── Merge template variables ──
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

      const recurrenceObj = recurrence || { type: "one-time" };

      // Manager campaigns need admin approval; super_admin campaigns are auto-approved
      const approvalStatus =
        req.user.role === "super_admin" ? "approved" : "pending_approval";

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
        message:
          req.user.role === "manager"
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

      if (!existing)
        return res.status(404).json({ error: "Campaign not found" });

      // Manager can only edit their own campaigns
      if (
        req.user.role === "manager" &&
        existing.createdBy.toString() !== req.user.id
      ) {
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

      // ── Audience validation ──
      if (audienceType === "tags" && (!tagIds || tagIds.length === 0)) {
        return res.status(400).json({ error: "Select at least one tag" });
      }
      if (
        audienceType === "contact" &&
        (!contactIds || contactIds.length === 0)
      ) {
        return res
          .status(400)
          .json({ error: "Select at least one contact" });
      }
      if (audienceType === "group" && (!groupIds || groupIds.length === 0)) {
        return res.status(400).json({ error: "Select at least one group" });
      }
      if (
        audienceType === "manual" &&
        (!manualNumbers || manualNumbers.length === 0)
      ) {
        return res.status(400).json({ error: "Enter manual numbers" });
      }

      // ── ✅ FIX: Always use user's chosen scheduledDateTime as first run ──
      // computeNextRun is only for the scheduler after a campaign fires.
      let nextRun = existing.nextRun;

      if (scheduledDateTime) {
        const scheduledDate = new Date(scheduledDateTime);
        if (!isNaN(scheduledDate.getTime())) {
          nextRun = scheduledDate; // ✅ use exactly what user picked, for ALL recurrence types
        }
      }

      // ── Merge variables ──
      let finalVariableValues =
        requestVariableValues || existing.variableValues || {};

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
            }
          }
        }
      }

      const recurrenceObj =
        recurrence || existing.recurrence || { type: "one-time" };

      // Manager edits go back to pending approval
      const approvalStatus =
        req.user.role === "manager"
          ? "pending_approval"
          : existing.approvalStatus;

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
          status:
            req.user.role === "manager" ? "draft" : existing.status,
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

      // Manager can only delete their own campaigns
      if (
        req.user.role === "manager" &&
        campaign.createdBy.toString() !== req.user.id
      ) {
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
      const validStatuses = [
        "active",
        "paused",
        "scheduled",
        "sent",
        "cancelled",
      ];

      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const campaign = await Campaign.findById(req.params.id);

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Manager can only update status of their own campaigns
      if (
        req.user.role === "manager" &&
        campaign.createdBy.toString() !== req.user.id
      ) {
        return res.status(403).json({ error: "Not authorized" });
      }

      campaign.status = status;

      // If resuming a recurring campaign whose nextRun has passed, push it forward
      if (status === "scheduled" || status === "active") {
        if (
          campaign.recurrence &&
          campaign.recurrence.type !== "one-time" &&
          (!campaign.nextRun || new Date(campaign.nextRun) < new Date())
        ) {
          campaign.nextRun = computeNextRun(campaign.recurrence, new Date());
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