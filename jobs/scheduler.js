const cron = require("node-cron");
const Campaign = require("../models/Campaign");
const Message = require("../models/Message");
const Contact = require("../models/Contact");
const Chat = require("../models/chat");

// ⏱ runs every 10 seconds
cron.schedule("*/10 * * * * *", async () => {
  try {
    console.log("⏱ Cron running...");

    const now = new Date();

    // ✅ 1. FIND campaigns to run
    const campaigns = await Campaign.find({
      status: "scheduled",
      scheduledDateTime: { $lte: now },
    });

    if (campaigns.length === 0) return;

    console.log(`🚀 Found ${campaigns.length} campaigns`);

    // ✅ 2. PROCESS EACH CAMPAIGN
    for (let campaign of campaigns) {
      try {
        console.log("📤 Running campaign:", campaign._id);

        let contacts = [];

        // 🔥 GET AUDIENCE

        // 👉 TAGS
        if (campaign.audienceType === "tags") {
          contacts = await Contact.find({
            tags: { $in: campaign.tagIds },
          });
        }

        // 👉 CONTACTS
        else if (campaign.audienceType === "contacts") {
          contacts = await Contact.find({
            _id: { $in: campaign.contactIds },
          });
        }

        // 👉 MANUAL NUMBERS
        else if (campaign.audienceType === "manual") {
          contacts = campaign.manualNumbers.map((num) => ({
            mobile: num,
            name: "User",
          }));
        }

        console.log(`👥 Found ${contacts.length} contacts`);

        // ✅ 3. SEND MESSAGE TO EACH CONTACT
        for (let contact of contacts) {
          try {
            // 🔥 find or create chat
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

            // 🔥 CREATE MESSAGE (template type)
            await Message.create({
              chatId: chat._id,
              sender: campaign.createdBy,
              messageType: "template",

              templateMeta: {
                templateId: campaign.templateId,
                body: campaign.messagePreview,
                variables: campaign.variableValues || {},
              },

              status: "sent",
              sentAt: new Date(),
            });

          } catch (err) {
            console.error("❌ Contact send failed:", err.message);
          }
        }

        // ✅ 4. UPDATE CAMPAIGN STATUS
        campaign.status = "completed";
        campaign.sentCount = contacts.length;
        campaign.updatedAt = new Date();

        await campaign.save();

        console.log("✅ Campaign completed:", campaign._id);

      } catch (err) {
        console.error("❌ Campaign error:", err.message);
      }
    }

    // ✅ OPTIONAL: delivery simulation
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