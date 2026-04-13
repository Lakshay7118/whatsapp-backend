const mongoose = require("mongoose");

const TemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    category: {
      type: String,
      enum: ["Marketing", "Utility", "Authentication"],
      required: true,
    },

    language: { type: String, default: "English" },

    type: {
      type: String,
      enum: ["Text", "Media", "Interactive"],
      default: "Text",
    },

    format: { type: String, required: true },

    footer: { type: String, default: "" },

    actionType: {
      type: String,
      enum: ["none", "callToActions", "quickReplies", "all"],
      default: "none",
    },

    // ✅ MEDIA
    mediaType: {
      type: String,
      enum: ["None", "Image", "Video", "Carousel"],
      default: "None",
    },

    imageFile: {
      name: { type: String },
      mimeType: { type: String },
      url: { type: String },
      _id: false,
    },

    videoFile: {
      name: { type: String },
      mimeType: { type: String },
      url: { type: String },
      _id: false,
    },

    // ✅ CAROUSEL
    carouselItems: [
      {
        id: { type: String },
        title: { type: String },
        description: { type: String },
        button: { type: String },
        mediaUrl: { type: String },
        mimeType: { type: String },
        _id: false,
      },
    ],

    // ✅ CTA BUTTONS
    ctaButtons: [
      {
        id: { type: String },
        btnType: { type: String, enum: ["URL", "Phone Number"] },
        title: { type: String },
        value: { type: String },
        _id: false,
      },
    ],

    // ✅ QUICK REPLIES
    quickReplies: [
      {
        id: { type: String },
        title: { type: String },
        _id: false,
      },
    ],

    // ✅ COPY CODE
    copyCodeButtons: [
      {
        id: { type: String },
        title: { type: String },
        _id: false,
      },
    ],

    // ✅ DROPDOWN
    dropdownButtons: [
      {
        id: { type: String },
        title: { type: String },
        placeholder: { type: String },
        options: { type: String },
        parsedOptions: [{ type: String }],
        selected: { type: String },
        _id: false,
      },
    ],

    // ✅ INPUT FIELDS
    inputFields: [
      {
        id: { type: String },
        label: { type: String },
        placeholder: { type: String },
        value: { type: String },
        _id: false,
      },
    ],

    // ✅ VARIABLES - stores how each {{1}}, {{2}} etc. should be resolved
    variables: {
      type: Map,
      of: new mongoose.Schema(
        {
          type: {
            type: String,
            enum: ["name", "number", "manual"],
            default: "manual",
          },
          value: { type: String, default: "" },
        },
        { _id: false }
      ),
      default: {},
    },

    // ✅ STATUS
    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"],
      default: "DRAFT",
    },

    createdBy: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Template", TemplateSchema);