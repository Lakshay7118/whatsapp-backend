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

    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, "g");
    text = text.replace(regex, value);
  });

  return text;
}

// 🔥 SEND MESSAGE TO 1-ON-1 CHAT (for tags/contacts/manual)
async function sendMessageToContact(contact, campaign, io) {
  const creatorPhone = campaign.createdBy?.phone || campaign.createdBy?.mobile;
  const targetPhone = contact.mobile;

  if (!creatorPhone || !targetPhone) {
    console.error("❌ Missing phone:", { creatorPhone, targetPhone });
    return;
  }

  let chat = await Chat.findOne({
    participants: { $all: [creatorPhone, targetPhone] },
    isGroup: false,
  });

  const isNewChat = !chat;

  if (!chat) {
    chat = await Chat.create({ participants: [creatorPhone, targetPhone] });
    console.log("✅ New chat created:", chat._id);
  }

  const template = await Template.findById(campaign.templateId).lean();
  if (!template) {
    console.error("❌ Template not found:", campaign.templateId);
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
    readBy: [],
  });

  await Chat.findByIdAndUpdate(chat._id, {
    lastMessage: "📋 Template",
    updatedAt: new Date(),
  });

  const msgPayload = { ...msg.toObject(), chatId: chat._id };

  io.to(String(chat._id)).emit("newMessage", msgPayload);
  io.to(creatorPhone).emit("chatUpdated", {
    chatId: chat._id,
    isNewChat,
    lastMessage: "📋 Template",
    participants: [creatorPhone, targetPhone],
  });
  io.to(targetPhone).emit("chatUpdated", {
    chatId: chat._id,
    isNewChat,
    lastMessage: "📋 Template",
    participants: [creatorPhone, targetPhone],
  });

  console.log("📡 Emitted to room:", String(chat._id), "| creator:", creatorPhone, "| recipient:", targetPhone);
  return msg;
}

// 🔥 NEW: SEND MESSAGE TO GROUP CHAT DIRECTLY
// One message visible to ALL members inside the group
async function sendMessageToGroupChat(groupChat, campaign, io, groupName, creatorPhone) {
  const template = await Template.findById(campaign.templateId).lean();
  if (!template) {
    console.error("❌ Template not found:", campaign.templateId);
    return;
  }

  // ✅ Patch variables — replace name-type with groupName
  const patchedVariableValues = Object.fromEntries(
    Object.entries(campaign.variableValues || {}).map(([key, mapping]) => [
      key,
      mapping.type === "name"
        ? { type: "custom", value: groupName }
        : mapping,
    ])
  );

  // Use groupName as contact name so resolveTemplateText works
  const groupContact = { name: groupName, mobile: creatorPhone };

  const resolvedBody = resolveTemplateText(template.format || "", patchedVariableValues, groupContact);
  const resolvedHeader = resolveTemplateText(template.name || "", patchedVariableValues, groupContact);
  const resolvedFooter = template.footer
    ? resolveTemplateText(template.footer, patchedVariableValues, groupContact)
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
    variables: patchedVariableValues,
    actions: {
      ctaButtons: template.ctaButtons || [],
      quickReplies: template.quickReplies || [],
      copyCodeButtons: template.copyCodeButtons || [],
      dropdownButtons: template.dropdownButtons || [],
      inputFields: template.inputFields || [],
    },
    carouselItems: template.carouselItems || [],
  };

  // ✅ Save message to the GROUP chat (not 1-on-1)
  const msg = await Message.create({
    chatId: groupChat._id,
    sender: creatorPhone,
    text: resolvedBody,
    messageType: "template",
    status: "sent",
    sentAt: new Date(),
    templateMeta,
    readBy: [],
  });

  // ✅ Update group chat lastMessage
  await Chat.findByIdAndUpdate(groupChat._id, {
    lastMessage: "📋 Template",
    updatedAt: new Date(),
  });

  const msgPayload = { ...msg.toObject(), chatId: groupChat._id };

  // ✅ Emit to group chat room — all members viewing it see it instantly
  io.to(String(groupChat._id)).emit("newMessage", msgPayload);

  // ✅ Notify every participant so their chat list refreshes
  groupChat.participants.forEach(phone => {
    io.to(phone).emit("chatUpdated", {
      chatId: groupChat._id,
      isNewChat: false,
      lastMessage: "📋 Template",
      participants: groupChat.participants,
    });
  });

  console.log(`📡 Emitted to GROUP room: ${groupChat._id} | Group: "${groupName}" | Members: ${groupChat.participants.length}`);
  return msg;
}

// ⏱ NEXT RUN TIME CALCULATOR
function getNextRunTime(lastRun, recurrence) {
  const interval = recurrence.interval || 1;
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;

  const utcMs = new Date(lastRun).getTime();
  const istDate = new Date(utcMs + IST_OFFSET);

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

  return new Date(istDate.getTime() - IST_OFFSET);
}

// 🔥 MAIN CRON FUNCTION
async function processCampaigns() {
  const now = new Date();

  const campaigns = await Campaign.find({
    status: "scheduled",
    approvalStatus: "approved",
    nextRun: { $lte: now },
  }).populate("createdBy", "phone name");

  if (campaigns.length === 0) return;

  console.log(`🚀 Found ${campaigns.length} campaigns to process`);

  const io = getIO();

  for (const campaign of campaigns) {
    console.log("📤 Running campaign:", campaign._id, "| Creator:", campaign.createdBy?.phone);

    if (!campaign.createdBy) {
      console.error("❌ Skipping — createdBy not found:", campaign._id);
      campaign.status = "failed";
      campaign.errorLog = "Creator user not found in database";
      await campaign.save();
      continue;
    }

    let recipients = [];
    let groupHandled = false;

    // ── TAGS ──
    if (campaign.audienceType === "tags") {
      recipients = await Contact.find({ tags: { $in: campaign.tagIds } });
    }

    // ── CONTACTS ──
    else if (campaign.audienceType === "contact") {
      recipients = await Contact.find({ _id: { $in: campaign.contactIds } });
    }

    // ── GROUP — sends ONE message to the group chat directly ──
    else if (campaign.audienceType === "group") {
      groupHandled = true;

      const groupChats = await Chat.find({
        _id: { $in: campaign.groupIds },
        isGroup: true,
      }).lean();

      if (groupChats.length === 0) {
        console.warn("⚠️ No group chats found for campaign:", campaign._id);
      }

      const creatorPhone = campaign.createdBy?.phone || campaign.createdBy?.mobile;

      for (const groupChat of groupChats) {
        const groupName = groupChat.groupName || "Team";
        console.log(`👥 Sending to GROUP "${groupName}" (${groupChat.participants.length} members)`);

        try {
          // ✅ ONE message to the group chat — visible to all members
          await sendMessageToGroupChat(groupChat, campaign, io, groupName, creatorPhone);
          campaign.sentCount += 1;
          console.log(`✅ Sent to group "${groupName}"`);
        } catch (err) {
          console.error(`❌ Failed for group "${groupName}":`, err.message);
        }
      }
    }

    // ── MANUAL ──
    else if (campaign.audienceType === "manual") {
      recipients = campaign.manualNumbers.map((num) => ({
        mobile: num,
        name: num,
      }));
    }

    // ── SEND (tags / contacts / manual) ──
    if (!groupHandled) {
      if (recipients.length === 0) {
        console.warn("⚠️ No recipients for campaign:", campaign._id);
        campaign.status = "sent";
        await campaign.save();
        continue;
      }

      console.log(`👥 Found ${recipients.length} recipients`);

      for (const contact of recipients) {
        try {
          await sendMessageToContact(contact, campaign, io);
          campaign.sentCount += 1;
        } catch (err) {
          console.error("❌ Send failed for:", contact.mobile, "|", err.message);
        }
      }
    }

    // ── RESCHEDULE OR MARK SENT ──
    // ── RESCHEDULE OR MARK SENT ──
if (campaign.recurrence?.type && campaign.recurrence.type !== "one-time") {
  campaign.nextRun = getNextRunTime(campaign.nextRun, campaign.recurrence);
  campaign.status = "scheduled";
  campaign.runCount = (campaign.runCount || 0) + 1;        // ✅ track how many times it ran
  campaign.lastSentCount = campaign.sentCount;              // ✅ save this run's count before reset
  campaign.sentCount = 0;                                   // reset for next run
} else {
  campaign.status = "sent";
}

await campaign.save();
console.log(`✅ Campaign ${campaign._id} done | run #${campaign.runCount} | sent: ${campaign.lastSentCount}`);
  }
}

// ⏱ Run every 10 seconds
cron.schedule("*/10 * * * * *", () => {
  processCampaigns().catch(console.error);
});

module.exports = { processCampaigns };