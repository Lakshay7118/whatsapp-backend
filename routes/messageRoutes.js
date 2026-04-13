const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const Chat = require("../models/chat");
const Contact = require("../models/Contact");
const Template = require("../models/Template");
const resolveTemplate = require("../utils/resolveTemplate");
const { getIO } = require("../sockets/socket");

// GET messages
router.get("/", async (req, res) => {
  const { chatId, userPhone } = req.query;
  if (!chatId) return res.status(400).json({ error: "chatId required" });

  const msgs = await Message.find({
    chatId,
    deletedBy: { $ne: userPhone },
  }).sort({ createdAt: 1 });

  res.json(msgs);
});

// SEND MESSAGE
router.post("/", async (req, res) => {
  try {
    const {
      chatId,
      sender,
      text,
      messageType,
      fileUrl,
      fileName,
      fileSize,
      templateMeta,
      receiverPhone,
    } = req.body;

    let resolvedTemplateMeta = null;

    // ── TEMPLATE HANDLING ──────────────────────────────────────────
    if (messageType === "template" && templateMeta) {

      resolvedTemplateMeta = {
        header:        templateMeta.header        || "",
        body:          templateMeta.body          || "",
        footer:        templateMeta.footer        || "",
        mediaType:     templateMeta.mediaType     || "None",
        mediaUrl:      templateMeta.mediaUrl      || null,
        templateId:    templateMeta.templateId    || null,
        variables:     templateMeta.variables     || {},
        carouselItems: templateMeta.carouselItems || [],
        resolvedText:  null,

        actions: {
          ctaButtons:      templateMeta.actions?.ctaButtons      || [],
          quickReplies:    templateMeta.actions?.quickReplies     || [],
          copyCodeButtons: templateMeta.actions?.copyCodeButtons  || [],
          dropdownButtons: templateMeta.actions?.dropdownButtons  || [],
          inputFields:     templateMeta.actions?.inputFields      || [],
        },
      };

      try {
        // Find contact by receiverPhone or by the other participant in the chat
        let contact = null;
        if (receiverPhone) {
          contact = await Contact.findOne({ mobile: receiverPhone });
        }
        if (!contact) {
          const chat = await Chat.findById(chatId);
          if (chat?.participants) {
            const otherPhone = chat.participants.find((p) => p !== sender);
            if (otherPhone) {
              contact = await Contact.findOne({ mobile: otherPhone });
            }
          }
        }

        // CASE 1: templateId provided — fetch template from DB and resolve
        if (templateMeta.templateId) {
          const template = await Template.findById(templateMeta.templateId);

          if (template) {
            // Convert Mongoose Map to plain object
            const vars =
              template.variables instanceof Map
                ? Object.fromEntries(template.variables)
                : Object.fromEntries(Object.entries(template.variables || {}));

            const resolved = resolveTemplate(template.format, vars, contact);
            resolvedTemplateMeta.body         = resolved;
            resolvedTemplateMeta.resolvedText = resolved;

            // Also pull actions directly from the stored template
            // in case the frontend didn't pass them all
            if (!resolvedTemplateMeta.actions.ctaButtons.length && template.ctaButtons?.length) {
              resolvedTemplateMeta.actions.ctaButtons = template.ctaButtons.map((btn) => ({
                id:    btn.id,
                label: btn.title || btn.label || "",
                url:   btn.value || btn.url   || "",
              }));
            }
            if (!resolvedTemplateMeta.actions.quickReplies.length && template.quickReplies?.length) {
              resolvedTemplateMeta.actions.quickReplies = template.quickReplies.map((r) => ({
                id:    r.id,
                label: r.title || r.label || "",
              }));
            }
            if (!resolvedTemplateMeta.actions.copyCodeButtons.length && template.copyCodeButtons?.length) {
              resolvedTemplateMeta.actions.copyCodeButtons = template.copyCodeButtons.map((btn) => ({
                id:    btn.id,
                label: btn.title || btn.label || "",
                value: btn.value || "",
              }));
            }
            if (!resolvedTemplateMeta.actions.dropdownButtons.length && template.dropdownButtons?.length) {
              resolvedTemplateMeta.actions.dropdownButtons = template.dropdownButtons;
            }
            if (!resolvedTemplateMeta.actions.inputFields.length && template.inputFields?.length) {
              resolvedTemplateMeta.actions.inputFields = template.inputFields;
            }
            if (!resolvedTemplateMeta.carouselItems.length && template.carouselItems?.length) {
              resolvedTemplateMeta.carouselItems = template.carouselItems;
            }
          }
        }

        // CASE 2: no templateId — resolve using variables passed directly
        else if (templateMeta.body && templateMeta.variables) {
          const resolved = resolveTemplate(
            templateMeta.body,
            templateMeta.variables,
            contact
          );
          resolvedTemplateMeta.body         = resolved;
          resolvedTemplateMeta.resolvedText = resolved;
        }

      } catch (err) {
        console.error("Template resolve error:", err.message);
      }
    }

    // ── CREATE MESSAGE ─────────────────────────────────────────────
    const msg = await Message.create({
      chatId,
      sender,
      text:        text || "",
      messageType: messageType || "text",
      fileUrl,
      fileName,
      fileSize,
      templateMeta: messageType === "template" ? resolvedTemplateMeta : null,
      status: "sent",
      readBy: [],
    });

    // ── UPDATE CHAT LAST MESSAGE ───────────────────────────────────
    let lastMessageText = text;
    if (messageType === "image")    lastMessageText = "📷 Photo";
    if (messageType === "file")     lastMessageText = `📎 ${fileName || "File"}`;
    if (messageType === "template") lastMessageText = "📋 Template";

    await Chat.findByIdAndUpdate(chatId, {
      lastMessage: lastMessageText,
      updatedAt:   new Date(),
    });

    // ── SOCKET EMIT ───────────────────────────────────────────────
    const io = getIO();
    io.to(chatId).emit("newMessage", msg);
    io.to(sender).emit("messageDelivered", {
      messageId: msg._id,
      chatId,
    });

    res.json(msg);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// MARK READ
router.post("/mark-read", async (req, res) => {
  try {
    const { chatId, userPhone } = req.body;

    await Message.updateMany(
      {
        chatId,
        sender: { $ne: userPhone },
        "readBy.user": { $ne: userPhone },
      },
      {
        $push:  { readBy: { user: userPhone, readAt: new Date() } },
        status: "seen",
      }
    );

    getIO().to(chatId).emit("messagesSeen", { chatId, user: userPhone });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE MESSAGE
router.delete("/:messageId", async (req, res) => {
  try {
    const { messageId }        = req.params;
    const { userPhone, mode }  = req.body;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    if (mode === "everyone") {
      if (message.sender !== userPhone) {
        return res.status(403).json({ error: "Not authorized" });
      }

      message.isDeleted    = true;
      message.text         = "This message was deleted";
      message.fileUrl      = null;
      message.fileName     = null;
      message.fileSize     = null;
      message.templateMeta = null;

      await message.save();

      getIO().to(message.chatId.toString()).emit("messageDeletedForEveryone", {
        messageId,
        chatId: message.chatId,
      });

    } else if (mode === "me") {
      if (!message.deletedBy.includes(userPhone)) {
        message.deletedBy.push(userPhone);
        await message.save();
      }

      getIO().to(userPhone).emit("messageDeletedForMe", {
        messageId,
        chatId:    message.chatId,
        userPhone,
      });
    }

    res.json({ message: "Message deleted" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;