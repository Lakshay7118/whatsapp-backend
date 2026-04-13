const cron = require("node-cron");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const Template = require("../models/Template");
const Message = require("../models/Message");
const Chat = require("../models/chat");
const resolveTemplate = require("../utils/resolveTemplate");
const { getIO } = require("../sockets/socket");

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

  // get template
  const template = await Template.findById(campaign.templateId);
  if (!template) return;

  // resolve variables
  let text = template.format;

  if (campaign.variableValues) {
    Object.entries(campaign.variableValues).forEach(([key, mapping]) => {
      let value = "";

      if (mapping.type === "name") value = contact.name || "Customer";
      else if (mapping.type === "phone") value = contact.mobile;
      else value = mapping.value || "";

      text = text.replace(new RegExp(`{{${key}}}`, "g"), value);
    });
  }

  text = text.replace(/\{\{\d+\}\}/g, "");

  // create message
  const msg = await Message.create({
    chatId: chat._id,
    sender: creatorPhone,
    text,
    messageType: "template",
    status: "sent",
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
    scheduledDateTime: { $lte: now }, // ✅ FIXED
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

    // ❌ SKIP GROUP (for now)
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

    for (const r of recipients) {
      try {
        await sendMessageToContact(r, campaign, io);
        campaign.sentCount += 1;
      } catch (err) {
        console.error("❌ Send failed:", err.message);
      }
    }

    // ✅ FIX STATUS
    campaign.status = "sent";
    await campaign.save();

    console.log("✅ Campaign completed");
  }
}

// ⏱ run every 10 sec
cron.schedule("*/10 * * * * *", () => {
  console.log("⏱ Cron running...");
  processCampaigns().catch(console.error);
});

module.exports = { processCampaigns };