const cron = require("node-cron");
const Message = require("../models/Message");

// ⏱ runs every 10 seconds
cron.schedule("*/10 * * * * *", async () => {
  try {
    console.log("⏱ Cron running...");

    const now = new Date();

    // ✅ 1. FIND scheduled messages
    const messages = await Message.find({
      status: "scheduled",
      scheduledAt: { $lte: now },
    });

    if (messages.length === 0) return;

    console.log(`📨 Found ${messages.length} scheduled messages`);

    // ✅ 2. SEND THEM
    for (let msg of messages) {
      try {
        console.log("🚀 Sending message:", msg._id);

        // 👉 IMPORTANT: CALL YOUR SEND FUNCTION HERE
        // Example:
        // await sendWhatsAppMessage(msg);

        // ✅ 3. UPDATE STATUS
        msg.status = "sent";
        msg.sentAt = new Date();

        await msg.save();

      } catch (err) {
        console.error("❌ Send failed:", err.message);
      }
    }

    // ✅ OPTIONAL: mark sent → delivered
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
      console.log(`✅ Delivered ${result.modifiedCount} messages`);
    }

  } catch (err) {
    console.error("❌ Cron error:", err.message);
  }
}, {
  timezone: "Asia/Kolkata", // 🔥 IMPORTANT
});