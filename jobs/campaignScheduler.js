const cron = require("node-cron");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const Template = require("../models/Template");
const Message = require("../models/Message");
const Chat = require("../models/chat");
const { getIO } = require("../sockets/socket");

// 🔥 SAFE TEMPLATE RESOLVER
function resolveTemplateText(templateText, variableValues, contact) {
  if (!templateText) return "";
  let text = String(templateText);

  if (!variableValues || Object.keys(variableValues).length === 0) {
    console.warn("⚠️ No variableValues provided");
    return text;
  }

  console.log("🔄 Original text:", text);
  console.log("📋 variableValues:", JSON.stringify(variableValues, null, 2));

  Object.entries(variableValues).forEach(([key, mapping]) => {
    let value = "";

    if (mapping.type === "name") {
      value = contact.name || "Customer";
    } else if (mapping.type === "phone") {
      value = contact.mobile || "";
    } else if (mapping.type === "custom" || mapping.type === "manual") {
      value = mapping.value || "";
    }

    if (!value || value.trim() === "") {
      console.warn(`⚠️ Empty value for {{${key}}}, using "N/A"`);
      value = "N/A";
    }

    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, "g");

    const before = text;
    text = text.replace(regex, value);
    console.log(`🔁 {{${key}}} → "${value}" (replaced: ${before !== text})`);
  });

  console.log("✅ FINAL RESOLVED TEXT:", text);
  return text;
}

// 🔥 SEND MESSAGE FUNCTION
async function sendMessageToContact(contact, campaign, io) {
  const creatorPhone = campaign.createdBy?.phone || campaign.createdBy?.mobile;
  const targetPhone = contact.mobile;

  

  if (!creatorPhone || !targetPhone) {
    console.error("❌ Missing phone:", { creatorPhone, targetPhone });
    return;
  }

  let chat = await Chat.findOne({
    participants: { $all: [creatorPhone, targetPhone] },
  });

  const isNewChat = !chat;

  if (!chat) {
    chat = await Chat.create({ participants: [creatorPhone, targetPhone] });
    console.log("✅ New chat created:", chat._id);
  }

  const template = await Template.findById(campaign.templateId).lean();
  if (!template) {
    console.error("❌ Template not found:", campaign._id);
    return;
  }

  const resolvedBody = resolveTemplateText(template.format || "", campaign.variableValues, contact);
  const resolvedHeader = resolveTemplateText(template.name || "", campaign.variableValues, contact);
  const resolvedFooter = template.footer
    ? resolveTemplateText(template.footer, campaign.variableValues, contact)
    : "";

  let mediaUrl = null;
  if (template.mediaType === "Image" && template.imageFile?.url) mediaUrl = template.imageFile.url;
  else if (template.mediaType === "Video" && template.videoFile?.url) mediaUrl = template.videoFile.url;

  const templateMeta = {
    templateId: template._id,
    header: resolvedHeader,
    body: resolvedBody,
    footer: resolvedFooter,
    resolvedText: resolvedBody,
    mediaType: template.mediaType || "None",
    mediaUrl,
    variables: campaign.variableValues || {},
    actions: {
      ctaButtons: template.ctaButtons || [],
      quickReplies: template.quickReplies || [],
      copyCodeButtons: template.copyCodeButtons || [],
      dropdownButtons: template.dropdownButtons || [],
      inputFields: template.inputFields || [],
    },
    carouselItems: template.carouselItems || [],
  };

  const msg = await Message.create({
    chatId: chat._id,
    sender: creatorPhone,
    text: resolvedBody,
    messageType: "template",
    status: "sent",
    sentAt: new Date(),
    templateMeta,
  });

  // ✅ FIX 2: Update chat's lastMessage so it sorts to top in chat list
  await Chat.findByIdAndUpdate(chat._id, {
    lastMessage: "📋 Template",
    updatedAt: new Date(),
  });

  const msgPayload = { ...msg.toObject(), chatId: chat._id };

  // ✅ FIX 1a: Emit to chatId room (for anyone already viewing this chat)
  io.to(String(chat._id)).emit("newMessage", msgPayload);

  // ✅ FIX 1b: Emit to creator's personal room so their chat list refreshes
  io.to(creatorPhone).emit("chatUpdated", {
    chatId: chat._id,
    isNewChat,
    lastMessage: "📋 Template",
    participants: [creatorPhone, targetPhone],
  });

  console.log("📡 Emitted to room:", String(chat._id), "| Notified:", creatorPhone);

  return msg;
}


function getNextRunTime(lastRun, recurrence) {
  const interval = recurrence.interval || 1;
  const IST_OFFSET = 5.5 * 60 * 60 * 1000; // 5h30m in ms

  // Convert lastRun to IST
  const utcMs = new Date(lastRun).getTime();
  const istMs = utcMs + IST_OFFSET;
  const istDate = new Date(istMs);

  switch (recurrence.type) {
    case "hourly":
      istDate.setHours(istDate.getHours() + interval);
      break;
    case "daily":
      istDate.setDate(istDate.getDate() + interval);
      break;
    case "weekly":
      istDate.setDate(istDate.getDate() + interval * 7);
      break;
    case "monthly":
      istDate.setMonth(istDate.getMonth() + interval);
      break;
  }

  // Convert back to UTC for MongoDB
  return new Date(istDate.getTime() - IST_OFFSET);
}
// 🔥 MAIN CRON FUNCTION
async function processCampaigns() {
  const now = new Date();

  // ✅ FIX 3: populate createdBy to get phone + only approved campaigns
  const campaigns = await Campaign.find({
    status: "scheduled",
    approvalStatus: "approved",
    nextRun: { $lte: now },
  }).populate("createdBy", "phone name"); // ✅ get phone from User model


  if (campaigns.length === 0) return;

  console.log(`🚀 Found ${campaigns.length} campaigns to process`);

for (const campaign of campaigns) {
  console.log("📤 Running campaign:", campaign._id, "| Creator:", campaign.createdBy?.phone);

  // ✅ Skip if creator not found
  if (!campaign.createdBy) {
    console.error("❌ Skipping campaign — createdBy user not found:", campaign._id);
    campaign.status = "failed";
    campaign.errorLog = "Creator user not found in database";
    await campaign.save();
    continue;
  }

    let recipients = [];

    // ✅ TAGS
    if (campaign.audienceType === "tags") {
      recipients = await Contact.find({
        tags: { $in: campaign.tagIds },
      });
    }

    // ✅ CONTACTS
    else if (campaign.audienceType === "contact") {
      recipients = await Contact.find({
        _id: { $in: campaign.contactIds },
      });
    }

    // ⚠️ GROUP (not implemented)
    else if (campaign.audienceType === "group") {
      console.log("⚠️ Group sending not implemented yet");
      continue;
    }

    // ✅ MANUAL
    else if (campaign.audienceType === "manual") {
      recipients = campaign.manualNumbers.map((num) => ({
        mobile: num,
        name: num,
      }));
    }

    console.log(`👥 Found ${recipients.length} recipients`);

    if (recipients.length === 0) {
      console.warn("⚠️ No recipients found for campaign:", campaign._id);
      campaign.status = "sent";
      await campaign.save();
      continue;
    }

    const io = getIO();

    for (const contact of recipients) {
      try {
        await sendMessageToContact(contact, campaign, io);
        campaign.sentCount += 1;
      } catch (err) {
        console.error("❌ Send failed for contact:", contact.mobile, "| Error:", err.message);
      }
    }

   // ✅ Fix — reschedule if recurring
if (campaign.recurrence?.type && campaign.recurrence.type !== "one-time") {
  const next = getNextRunTime(campaign.nextRun, campaign.recurrence);
  campaign.nextRun = next;
  campaign.status = "scheduled";
  campaign.sentCount = 0;
} else {
  campaign.status = "sent";
}
await campaign.save();

    console.log(`✅ Campaign ${campaign._id} completed — sent to ${campaign.sentCount} contacts`);
  }
}

// ⏱ run every 10 seconds
cron.schedule("*/10 * * * * *", () => {
  processCampaigns().catch(console.error);
});

module.exports = { processCampaigns };