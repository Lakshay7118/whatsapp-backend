const express = require("express");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const protect = require("../middleware/authMiddleware"); // ✅ JWT middleware

const router = express.Router();

// Helper to compute next run date
function computeNextRun(recurrence, baseDate = new Date()) {
  const next = new Date(baseDate);
  switch (recurrence.type) {
    case "daily":
      next.setDate(next.getDate() + recurrence.interval);
      break;
    case "weekly":
      next.setDate(next.getDate() + (7 * recurrence.interval));
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
// ✅ CREATE CAMPAIGN
// =======================
router.post("/campaigns", protect, async (req, res) => {
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

    // ✅ validation
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
      createdBy: req.user.id, // 🔥 from JWT
      status: "scheduled",
      nextRun,
    });

    await campaign.save();

    res.status(201).json({
      success: true,
      campaign,
    });
  } catch (error) {
    console.error("Campaign creation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ GET ALL CAMPAIGNS
// =======================
router.get("/campaigns", protect, async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .sort({ scheduledDateTime: -1 });

    res.json({ success: true, campaigns });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ DELETE CAMPAIGN
// =======================
router.delete("/campaigns/:id", protect, async (req, res) => {
  try {
    const deleted = await Campaign.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Campaign not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete campaign error:", error);
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ✅ UPDATE STATUS
// =======================
router.patch("/campaigns/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["active", "paused", "scheduled", "sent"];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
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
});

module.exports = router;

