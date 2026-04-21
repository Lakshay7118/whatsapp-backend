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
  // ✅ FIX 1: createdBy is now populated — use .phone not the ObjectId
  const creatorPhone = campaign.createdBy?.phone;
  const targetPhone = contact.mobile;

  if (!creatorPhone) {
    console.error("❌ creatorPhone is missing — createdBy not populated correctly");
    return;
  }

  if (!targetPhone) {
    console.error("❌ targetPhone is missing for contact:", contact);
    return;
  }

  // find/create chat
  let chat = await Chat.findOne({
    participants: { $all: [creatorPhone, targetPhone] },
  });

  if (!chat) {
    chat = await Chat.create({
      participants: [creatorPhone, targetPhone],
    });
    console.log("✅ New chat created:", chat._id);
  }

  // get template with all fields
  const template = await Template.findById(campaign.templateId).lean();
  if (!template) {
    console.error("❌ Template not found for campaignId:", campaign._id);
    return;
  }

  console.log("📦 CAMPAIGN VARIABLE VALUES:", campaign.variableValues);
  console.log("👤 CONTACT:", contact.name, contact.mobile);
  console.log("🧾 TEMPLATE:", template.name);

  // Resolve body text with variables
  const resolvedBody = resolveTemplateText(
    template.format || "",
    campaign.variableValues,
    contact
  );

  // Resolve header
  const resolvedHeader = resolveTemplateText(
    template.name || "",
    campaign.variableValues,
    contact
  );

  // Resolve footer
  const resolvedFooter = template.footer
    ? resolveTemplateText(template.footer, campaign.variableValues, contact)
    : "";

  // Extract media URL
  let mediaUrl = null;
  if (template.mediaType === "Image" && template.imageFile?.url) {
    mediaUrl = template.imageFile.url;
  } else if (template.mediaType === "Video" && template.videoFile?.url) {
    mediaUrl = template.videoFile.url;
  }

  // Build templateMeta matching what frontend expects
  const templateMeta = {
    templateId: template._id,
    header: resolvedHeader,
    body: resolvedBody,
    footer: resolvedFooter,
    resolvedText: resolvedBody,
    mediaType: template.mediaType || "None",
    mediaUrl: mediaUrl,
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

  // Create message in DB
  const msg = await Message.create({
    chatId: chat._id,       // ✅ must be set for live chat to match
    sender: creatorPhone,
    text: resolvedBody,
    messageType: "template",
    status: "sent",
    sentAt: new Date(),
    templateMeta,
  });

  console.log("✅ Message created:", msg._id, "for chat:", chat._id);

  // ✅ FIX 2: emit to chatId room (NOT phone rooms)
  // Live chat joins rooms via: s.emit("joinChat", chatId)
  // handleNewMessage filters by: if (String(msg.chatId) !== String(chatId)) return
  // So we MUST emit to chatId room with chatId on the payload
  const msgPayload = {
    ...msg.toObject(),
    chatId: chat._id,  // ✅ ensures handleNewMessage filter passes
  };

  io.to(String(chat._id)).emit("newMessage", msgPayload);

  console.log("📡 Emitted to room:", String(chat._id));

  return msg;
}

// 🔥 MAIN CRON FUNCTION
async function processCampaigns() {
  const now = new Date();

  // ✅ FIX 3: populate createdBy to get phone + only approved campaigns
  const campaigns = await Campaign.find({
    status: "scheduled",
    approvalStatus: "approved",
    scheduledDateTime: { $lte: now },
  }).populate("createdBy", "phone name"); // ✅ get phone from User model

  if (campaigns.length === 0) return;

  console.log(`🚀 Found ${campaigns.length} campaigns to process`);

  for (const campaign of campaigns) {
    console.log("📤 Running campaign:", campaign._id, "| Creator:", campaign.createdBy?.phone);

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

    // ✅ mark campaign as sent
    campaign.status = "sent";
    await campaign.save();

    console.log(`✅ Campaign ${campaign._id} completed — sent to ${campaign.sentCount} contacts`);
  }
}

// ⏱ run every 10 seconds
cron.schedule("*/10 * * * * *", () => {
  processCampaigns().catch(console.error);
});

module.exports = { processCampaigns };