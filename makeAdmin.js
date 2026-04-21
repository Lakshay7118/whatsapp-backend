const mongoose = require("mongoose");
const Contact = require("./models/Contact");
const User = require("./models/Users");
require("dotenv").config();

async function makeAdmin() {
  await mongoose.connect(process.env.MONGO_URI);

  const phone = 6376245999; // ✅ change this

  await Contact.updateOne({ mobile: phone }, { $set: { role: "super_admin" } });
  await User.updateOne({ phone: phone }, { $set: { role: "super_admin" } });

  console.log("✅ Role updated to super_admin for", phone);
  process.exit(0);
}

makeAdmin();