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

    // Determine value
    if (mapping.type === "name") {
      value = contact.name || "Customer";
    } else if (mapping.type === "phone") {
      value = contact.mobile || "";
    } else if (mapping.type === "custom" || mapping.type === "manual") {
      value = mapping.value || "";
    }

    // Fallback
    if (!value || value.trim() === "") {
      console.warn(`⚠️ Empty value for {{${key}}}, using "N/A"`);
      value = "N/A";
    }

    // ✅ ESCAPED CURLY BRACES FOR REGEX
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
  const creatorPhone = campaign.createdBy;
  const targetPhone = contact.mobile;

  // find/create chat
  let chat = await Chat.findOne({
    participants: { $all: [creatorPhone, targetPhone] },
  });

  if (!chat) {
    chat = await Chat.create({
      participants: [creatorPhone, targetPhone],
    });
  }

  // get template with all fields
  const template = await Template.findById(campaign.templateId).lean();
  if (!template) {
    console.error("❌ Template not found");
    return;
  }

  console.log("📦 CAMPAIGN VARIABLE VALUES:", campaign.variableValues);
  console.log("👤 CONTACT:", contact.name, contact.mobile);
  console.log("🧾 TEMPLATE:", template.name);

  // Resolve body text (format) with variables
  const resolvedBody = resolveTemplateText(
    template.format || "",
    campaign.variableValues,
    contact
  );

  // Resolve header (using template.name as the header text, just like frontend does)
  const resolvedHeader = resolveTemplateText(
    template.name || "",
    campaign.variableValues,
    contact
  );

  // Resolve footer (if it exists)
  const resolvedFooter = template.footer
    ? resolveTemplateText(template.footer, campaign.variableValues, contact)
    : "";

  // Extract media URL based on mediaType
  let mediaUrl = null;
  if (template.mediaType === "Image" && template.imageFile?.url) {
    mediaUrl = template.imageFile.url;
  } else if (template.mediaType === "Video" && template.videoFile?.url) {
    mediaUrl = template.videoFile.url;
  }

  // Build templateMeta exactly as frontend expects (matching sendTemplate in LiveChatPage)
  const templateMeta = {
    templateId: template._id,
    header: resolvedHeader,                 // ✅ Now using template.name
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

  // create message WITH templateMeta
  const msg = await Message.create({
    chatId: chat._id,
    sender: creatorPhone,
    text: resolvedBody,                // fallback plain text
    messageType: "template",
    status: "sent",
    sentAt: new Date(),
    templateMeta,                      // <-- now fully populated
  });

  // socket emit
  io.to(targetPhone).emit("newMessage", msg);
  io.to(creatorPhone).emit("newMessage", msg);

  return msg;
}

// 🔥 MAIN CRON FUNCTION
async function processCampaigns() {
  const now = new Date();

  const campaigns = await Campaign.find({
    status: "scheduled",
    scheduledDateTime: { $lte: now },
  });

  if (campaigns.length === 0) return;

  console.log(`🚀 Found ${campaigns.length} campaigns`);

  for (const campaign of campaigns) {
    console.log("📤 Running campaign:", campaign._id);

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

    // ❌ GROUP (skip)
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

    console.log(`👥 Found ${recipients.length} contacts`);

    const io = getIO();

    for (const contact of recipients) {
      try {
        await sendMessageToContact(contact, campaign, io);
        campaign.sentCount += 1;
      } catch (err) {
        console.error("❌ Send failed:", err.message);
      }
    }

    // ✅ mark campaign completed
    campaign.status = "sent";
    await campaign.save();

    console.log("✅ Campaign completed");
  }
}

// ⏱ run every 10 sec
cron.schedule("*/10 * * * * *", () => {
  processCampaigns().catch(console.error);
});

module.exports = { processCampaigns };