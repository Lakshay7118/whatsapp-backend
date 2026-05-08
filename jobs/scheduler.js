const cron = require("node-cron");
const Campaign = require("../models/Campaign");
const Message = require("../models/Message");
const Contact = require("../models/Contact");
const Chat = require("../models/chat");
const Template = require("../models/Template");

// 🔥 TEMPLATE RESOLVER
function resolveTemplate(template, variables, contact) {
  let text = template.format;

  if (!variables) return text;

  Object.entries(variables).forEach(([key, mapping]) => {
    let value = "";

    if (mapping.type === "name") {
      value = contact.name || "Customer";
    } else if (mapping.type === "phone") {
      value = contact.mobile || "";
    } else if (mapping.type === "custom") {
      value = mapping.value || "5"; // ✅ fallback
    }

    console.log(`➡️ {{${key}}} →`, value);

    text = text.replace(new RegExp(`{{${key}}}`, "g"), value);
  });

  return text;
}

// ⏱ runs every 10 seconds
cron.schedule("*/10 * * * * *", async () => {
  try {
    const now = new Date();

    const campaigns = await Campaign.find({
      status: "scheduled",
      scheduledDateTime: { $lte: now },
    });

    if (campaigns.length === 0) return;

    console.log(`🚀 Found ${campaigns.length} campaigns`);

    for (let campaign of campaigns) {
      try {
        console.log("📤 Running campaign:", campaign._id);

        let contacts = [];

        // 👉 TAGS
        if (campaign.audienceType === "tags") {
          contacts = await Contact.find({
            tags: { $in: campaign.tagIds },
          });
        }

        // 👉 CONTACTS
        else if (campaign.audienceType === "contact") {
          contacts = await Contact.find({
            _id: { $in: campaign.contactIds },
          });
        }

        // 👉 MANUAL
        else if (campaign.audienceType === "manual") {
          contacts = campaign.manualNumbers.map((num) => ({
            mobile: num,
            name: "User",
          }));
        }

        console.log(`👥 Found ${contacts.length} contacts`);

        // 🔥 GET TEMPLATE ONCE
        const template = await Template.findById(campaign.templateId);
        if (!template) {
          console.error("❌ Template not found");
          continue;
        }

        for (let contact of contacts) {
          try {
            // 🔥 create chat
            let chat = await Chat.findOne({
              participants: { $all: [campaign.createdBy, contact.mobile] },
            });

            if (!chat) {
              chat = await Chat.create({
                participants: [campaign.createdBy, contact.mobile],
                name: contact.name || contact.mobile,
                isGroup: false,
              });
            }

            // 🔥 RESOLVE MESSAGE HERE (IMPORTANT FIX)
            const finalText = resolveTemplate(
              template,
              campaign.variableValues,
              contact
            );

            console.log("✅ FINAL MESSAGE:", finalText);

            await Message.create({
  chatId: chat._id,
  sender: campaign.createdBy,

  text: finalText, // ✅ ADD THIS (IMPORTANT)

  messageType: "template",

  templateMeta: {
    body: finalText,
  },

  status: "sent",
});

          } catch (err) {
            console.error("❌ Contact send failed:", err.message);
          }
        }

        // ✅ update campaign
        campaign.status = "completed";
        campaign.sentCount = contacts.length;
        campaign.updatedAt = new Date();

        await campaign.save();

        console.log("✅ Campaign completed:", campaign._id);

      } catch (err) {
        console.error("❌ Campaign error:", err.message);
      }
    }

    // ✅ simulate delivery
    const result = await Message.updateMany(
      { status: "sent" },
      {
        $set: {
          status: "delivered",
          deliveredAt: new Date(),
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`📦 Delivered ${result.modifiedCount} messages`);
    }

  } catch (err) {
    console.error("❌ Cron error:", err.message);
  }
}, {
  timezone: "Asia/Kolkata",
});