const cron = require("node-cron");
const mongoose = require("mongoose");
require("dotenv").config();

const Message = require("./models/Message");

// ✅ DB CONNECT (IMPORTANT)
mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log("✅ DB Connected (Cron)");
});

// ✅ CRON
cron.schedule("*/10 * * * * *", async () => {
  console.log("⏰ Cron running:", new Date());

  try {
    const now = new Date();

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
      console.log(`✅ Updated ${result.modifiedCount} messages`);
    }

  } catch (err) {
    console.error("❌ Cron error:", err.message);
  }
});