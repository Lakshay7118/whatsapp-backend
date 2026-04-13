// utils/enrichChat.js
const Message = require("../models/Message");
const User = require("../models/Users");
const Contact = require("../models/Contact");

async function enrichChat(chat, currentUserPhone) {
  // ── GROUP CHAT ──────────────────────────────────
  if (chat.isGroup) {
    // For groups, name is groupName, no single "other" participant
    const unreadCount = await Message.countDocuments({
      chatId: chat._id,
      "readBy.user": { $ne: currentUserPhone }
    });

    const lastMsg = await Message.findOne({ chatId: chat._id })
      .sort({ createdAt: -1 })
      .limit(1);
    const lastMessageText = lastMsg?.text || (lastMsg?.messageType === "image" ? "📷 Photo" : lastMsg?.messageType === "file" ? "📎 File" : "");
    const lastMessageTime = lastMsg?.createdAt || chat.updatedAt;

    return {
      _id: chat._id,
      name: chat.groupName,
      phone: null,                 // no single phone for group
      email: "",
      city: "",
      tag: "",
      notes: "",
      status: chat.status,
      lastSeen: chat.lastSeen,
      unread: unreadCount,
      lastMessage: lastMessageText,
      lastMessageTime: lastMessageTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      participants: chat.participants,
      isGroup: true,
      admin: chat.admin,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  // ── INDIVIDUAL CHAT (1‑on‑1) ────────────────────
  const otherPhone = chat.participants.find(p => p !== currentUserPhone);

  let otherUser = await User.findOne({ phone: otherPhone });
  let otherContact = await Contact.findOne({ mobile: otherPhone });

  const name = otherUser?.name || otherContact?.name || otherPhone;
  const email = otherUser?.email || "";
  const city = "";
  const tag = otherContact?.tags?.[0] || "";
  const notes = "";

  const unreadCount = await Message.countDocuments({
    chatId: chat._id,
    sender: otherPhone,
    "readBy.user": { $ne: currentUserPhone }
  });

  const lastMsg = await Message.findOne({ chatId: chat._id })
    .sort({ createdAt: -1 })
    .limit(1);
  const lastMessageText = lastMsg?.text || (lastMsg?.messageType === "image" ? "📷 Photo" : lastMsg?.messageType === "file" ? "📎 File" : "");
  const lastMessageTime = lastMsg?.createdAt || chat.updatedAt;

  return {
    _id: chat._id,
    name,
    phone: otherPhone,
    email,
    city,
    tag,
    notes,
    status: chat.status,
    lastSeen: chat.lastSeen,
    unread: unreadCount,
    lastMessage: lastMessageText,
    lastMessageTime: lastMessageTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    participants: chat.participants,
    isGroup: false,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

module.exports = enrichChat;