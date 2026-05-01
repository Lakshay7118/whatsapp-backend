const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail", // or use 'hotmail', 'yahoo', etc.
  auth: {
    user: process.env.EMAIL_USER,   // your email
    pass: process.env.EMAIL_PASS,   // app password (not your login password)
  },
});

const sendEmail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"WhatsApp App" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

module.exports = sendEmail;