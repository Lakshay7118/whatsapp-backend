const cron = require("node-cron");
const Message = require("../models/Message");

// runs every 10 seconds (testing ke liye)
cron.schedule("*/10 * * * * *", async () => {
  try {
    const now = new Date();

    // 🔥 SINGLE QUERY (no loop, no multiple DB calls)
    const result = await Message.updateMany(
      { status: "sent" },
      {
        $set: {
          status: "delivered",
          deliveredAt: now,
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ Updated ${result.modifiedCount} messages to delivered`);
    }

  } catch (err) {
    console.error("❌ Cron error:", err.message);
  }
});