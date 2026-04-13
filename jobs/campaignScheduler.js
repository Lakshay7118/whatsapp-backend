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

  // ── Find or create chat ───────────────────────────────────────
  let chat = await Chat.findOne({
    participants: { $all: [creatorPhone, targetPhone] },
  });
  if (!chat) {
    chat = await Chat.create({
      participants: [creatorPhone, targetPhone],
    });
  }

  // ── Fetch template ────────────────────────────────────────────
  const template = await Template.findById(campaign.templateId);
  if (!template) {
    console.error(`Template ${campaign.templateId} not found`);
    return;
  }

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
        // ✅ support both 'value' and 'customValue' field names
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

  // ── Create message ────────────────────────────────────────────
  const msg = await Message.create({
    chatId:      chat._id,
    sender:      creatorPhone,
    text:        resolvedText,
    messageType: "template",
    fileUrl:     template.imageFile?.url || template.videoFile?.url || null,
    fileName:    template.imageFile?.name || template.videoFile?.name || null,

    templateMeta: {
      // ✅ templateId — was completely missing before
      templateId: template._id,

      header:       template.name     || "",
      body:         resolvedText,
      resolvedText: resolvedText,
      footer:       template.footer   || "",
      mediaType:    template.mediaType || "None",
      mediaUrl:     template.imageFile?.url || template.videoFile?.url || null,

      // ✅ variables — was missing before
      variables: templateVars,

      // ✅ carouselItems — was missing before
      carouselItems: template.carouselItems || [],

      actions: {
        // ✅ normalize field names: title→label, value→url
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

        // ✅ copyCodeButtons — was missing before
        copyCodeButtons: (template.copyCodeButtons || []).map(btn => ({
          id:    btn.id,
          label: btn.title || btn.label || "",
          value: btn.value || "",
        })),

        // ✅ dropdownButtons — was missing before
        dropdownButtons: (template.dropdownButtons || []).map(dd => ({
          id:           dd.id,
          title:        dd.title        || "",
          placeholder:  dd.placeholder  || "",
          options:      dd.options      || "",
          parsedOptions: dd.parsedOptions || [],
          selected:     dd.selected     || "",
        })),

        // ✅ inputFields — was missing before
        inputFields: (template.inputFields || []).map(f => ({
          id:          f.id,
          label:       f.label       || "",
          placeholder: f.placeholder || "",
          value:       f.value       || "",
        })),
      },
    },

    status: "sent",
  });

  // ── Emit socket events ────────────────────────────────────────
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
  const now = new Date();

  const campaigns = await Campaign.find({
    status:  "scheduled",
    nextRun: { $lte: now },
  });

  for (const campaign of campaigns) {
    console.log(`Processing campaign: ${campaign.campaignName}`);

    let recipients = [];

    if (campaign.audienceType === "tags") {
      recipients = await Contact.find({ tag: { $in: campaign.tagIds } });
    } else if (campaign.audienceType === "contact") {
      recipients = await Contact.find({ _id: { $in: campaign.contactIds } });
    } else if (campaign.audienceType === "group") {
      // ✅ group support was missing
     
      const groups = await Group.find({ _id: { $in: campaign.groupIds } });
      const phones = groups.flatMap(g => g.participants || []);
      recipients = await Contact.find({ mobile: { $in: phones } });
    } else if (campaign.audienceType === "manual") {
      recipients = campaign.manualNumbers.map(num => ({
        mobile: num,
        name:   num,
      }));
    }

    const io = getIO();

    for (const recipient of recipients) {
      try {
        await sendMessageToContact(recipient, campaign, io);
        campaign.sentCount += 1;
      } catch (err) {
        console.error(`Failed to send to ${recipient.mobile}:`, err);
        campaign.errorLog += `\n${recipient.mobile}: ${err.message}`;
      }
    }

    // ── Update campaign status ────────────────────────────────
    if (campaign.recurrence.type === "one-time") {
      campaign.status = "sent";
    } else {
      campaign.nextRun = computeNextRun(campaign.recurrence, new Date());
    }

    await campaign.save();
  }
}

function computeNextRun(recurrence, baseDate) {
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

cron.schedule("* * * * *", () => {
  processCampaigns().catch(console.error);
});

module.exports = { processCampaigns };