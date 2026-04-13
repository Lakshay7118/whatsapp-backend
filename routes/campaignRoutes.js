const cron = require("node-cron");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const Template = require("../models/Template");
const Message = require("../models/Message");
const Chat = require("../models/chat");
const resolveTemplate = require("../utils/resolveTemplate");
const { getIO } = require("../sockets/socket");

async function sendMessageToContact(contact, campaign, io) {
  const creatorPhone = campaign.createdBy;
  const targetPhone  = contact.mobile;

  if (!targetPhone) {
    console.warn("⚠️ No mobile for contact, skipping");
    return;
  }

  // ── Find or create chat ───────────────────────────────────────
  let chat = await Chat.findOne({
    participants: { $all: [creatorPhone, targetPhone] },
    isGroup: false,
  });
  if (!chat) {
    console.log(`💬 Creating new chat between ${creatorPhone} and ${targetPhone}`);
    chat = await Chat.create({
      participants: [creatorPhone, targetPhone],
      isGroup: false,
      lastMessage: "",
    });
  }
  console.log(`💬 Chat ID: ${chat._id}`);

  // ── Fetch template ────────────────────────────────────────────
  const template = await Template.findById(campaign.templateId);
  if (!template) {
    console.error(`❌ Template ${campaign.templateId} not found`);
    return;
  }
  console.log(`📄 Template found: ${template.name}`);

  // ── Convert Mongoose Map → plain object ───────────────────────
  const templateVars =
    template.variables instanceof Map
      ? Object.fromEntries(template.variables)
      : Object.fromEntries(Object.entries(template.variables || {}));

  // ── Resolve variables ─────────────────────────────────────────
  let resolvedText = resolveTemplate(template.format, templateVars, contact);

  // Apply campaign-level variableMappings if present
  if (campaign.variableValues && Object.keys(campaign.variableValues).length > 0) {
    Object.entries(campaign.variableValues).forEach(([key, mapping]) => {
      let resolvedValue = "";
      if (mapping.type === "name") {
        resolvedValue = (contact?.name && contact.name !== "UNKNOWN")
          ? contact.name : "Customer";
      } else if (mapping.type === "phone") {
        resolvedValue = contact?.mobile || "";
      } else if (mapping.type === "custom") {
        resolvedValue = mapping.value || mapping.customValue || "";
      }
      resolvedText = resolvedText.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, "g"),
        resolvedValue
      );
    });
  }

  // Clean up any remaining unresolved placeholders
  resolvedText = resolvedText.replace(/\{\{\d+\}\}/g, "");
  console.log(`📝 Resolved text: ${resolvedText}`);

  // ── Create message ────────────────────────────────────────────
  const msg = await Message.create({
    chatId:      chat._id,
    sender:      creatorPhone,
    text:        resolvedText,
    messageType: "template",
    fileUrl:     template.imageFile?.url  || template.videoFile?.url  || null,
    fileName:    template.imageFile?.name || template.videoFile?.name || null,

    templateMeta: {
      templateId:   template._id,
      header:       template.name     || "",
      body:         resolvedText,
      resolvedText: resolvedText,
      footer:       template.footer   || "",
      mediaType:    template.mediaType || "None",
      mediaUrl:     template.imageFile?.url || template.videoFile?.url || null,
      variables:    templateVars,
      carouselItems: template.carouselItems || [],

      actions: {
        ctaButtons: (template.ctaButtons || []).map(btn => ({
          id:      btn.id,
          label:   btn.title  || btn.label || "",
          url:     btn.value  || btn.url   || "",
          btnType: btn.btnType || "",
        })),
        quickReplies: (template.quickReplies || []).map(r => ({
          id:    r.id,
          title: r.title || r.label || "",
        })),
        copyCodeButtons: (template.copyCodeButtons || []).map(btn => ({
          id:    btn.id,
          label: btn.title || btn.label || "",
          value: btn.value || "",
        })),
        dropdownButtons: (template.dropdownButtons || []).map(dd => ({
          id:            dd.id,
          title:         dd.title        || "",
          placeholder:   dd.placeholder  || "",
          options:       dd.options      || "",
          parsedOptions: dd.parsedOptions || [],
          selected:      dd.selected     || "",
        })),
        inputFields: (template.inputFields || []).map(f => ({
          id:          f.id,
          label:       f.label       || "",
          placeholder: f.placeholder || "",
          value:       f.value       || "",
        })),
      },
    },

    status: "sent",
    readBy: [],
  });

  console.log(`✅ Message created: ${msg._id}`);

  // ── Emit socket events ────────────────────────────────────────
  io.to(chat._id.toString()).emit("newMessage", msg);
  io.to(targetPhone).emit("newMessage", msg);
  io.to(creatorPhone).emit("newMessage", msg);
  io.to(creatorPhone).emit("messageDelivered", {
    messageId: msg._id,
    chatId:    chat._id,
  });

  // ── Update chat last message ──────────────────────────────────
  await Chat.findByIdAndUpdate(chat._id, {
    lastMessage: resolvedText,
    updatedAt:   new Date(),
  });

  return msg;
}

async function processCampaigns() {
  try {
    const now = new Date();
    console.log("⏰ Scheduler tick:", now.toISOString());

    const campaigns = await Campaign.find({
      status:  "scheduled",
      nextRun: { $lte: now },
    });

    console.log(`📋 Due campaigns: ${campaigns.length}`);

    // Debug log all scheduled campaigns
    const allScheduled = await Campaign.find({ status: "scheduled" });
    console.log("All scheduled:", allScheduled.map(c => ({
      name:    c.campaignName,
      nextRun: c.nextRun,
      isDue:   new Date(c.nextRun) <= now,
    })));

    for (const campaign of campaigns) {
      console.log(`🚀 Processing: "${campaign.campaignName}" | audience: ${campaign.audienceType}`);

      let recipients = [];

      try {
        if (campaign.audienceType === "tags") {
          recipients = await Contact.find({ tag: { $in: campaign.tagIds } }); // ✅ fixed: tag not tags
          console.log(`🏷️ Tag recipients: ${recipients.length}`);

        } else if (campaign.audienceType === "contact") {
          recipients = await Contact.find({ _id: { $in: campaign.contactIds } });
          console.log(`👤 Contact recipients: ${recipients.length}`);

        } else if (campaign.audienceType === "group") {
          const Chat = require("../models/chat");
          const groups = await Chat.find({
            _id:     { $in: campaign.groupIds },
            isGroup: true,
          });
          const phones = groups.flatMap(g => g.participants || []);
          recipients = await Contact.find({ mobile: { $in: phones } });
          console.log(`👥 Group recipients: ${recipients.length}`);

        } else if (campaign.audienceType === "manual") {
          recipients = campaign.manualNumbers.map(num => ({
            mobile: num,
            name:   num,
          }));
          console.log(`📱 Manual recipients: ${recipients.length}`);
        }

      } catch (audienceErr) {
        console.error("❌ Error resolving audience:", audienceErr.message);
        continue;
      }

      if (recipients.length === 0) {
        console.warn(`⚠️ No recipients found for campaign: ${campaign.campaignName}`);
        // Still mark as sent so it doesn't loop
        campaign.status = "sent";
        await campaign.save();
        continue;
      }

      const io = getIO();

      for (const recipient of recipients) {
        try {
          console.log(`📨 Sending to: ${recipient.mobile}`);
          await sendMessageToContact(recipient, campaign, io);
          campaign.sentCount += 1;
          console.log(`✅ Sent to: ${recipient.mobile}`);
        } catch (err) {
          console.error(`❌ Failed for ${recipient.mobile}:`, err.message);
          campaign.errorLog += `\n${recipient.mobile}: ${err.message}`;
        }
      }

      // ── Update campaign status ──────────────────────────────────
      if (campaign.recurrence.type === "one-time") {
        campaign.status = "sent";
      } else {
        campaign.nextRun = computeNextRun(campaign.recurrence, new Date());
        campaign.status  = "scheduled";
      }

      try {
        await campaign.save();
        console.log(`💾 Campaign "${campaign.campaignName}" → status: ${campaign.status}`);
      } catch (saveErr) {
        console.error("❌ Failed to save campaign:", saveErr.message);
      }
    }

  } catch (err) {
    console.error("❌ processCampaigns error:", err.message);
  }
}

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
      if (recurrence.dayOfMonth) next.setDate(recurrence.dayOfMonth);
      break;
    case "hourly":
      next.setHours(next.getHours() + recurrence.interval);
      break;
    default:
      return null;
  }
  return next;
}

// Run every minute
cron.schedule("* * * * *", () => {
  processCampaigns().catch(console.error);
});

module.exports = { processCampaigns };