function resolveTemplate(format, variables, contact) {
  let message = format;

  const vars = variables instanceof Map
    ? Object.fromEntries(variables)
    : (variables || {});

  Object.entries(vars).forEach(([key, config]) => {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    let resolvedValue = "";

    console.log(`🔑 Processing {{${key}}}`, config);

    switch (config.type) {

      case "name":
        resolvedValue =
          contact?.name && contact.name !== "UNKNOWN"
            ? contact.name
            : "Customer";
        break;

      case "phone":   // ✅ FIXED (was number)
        resolvedValue = contact?.mobile || "";
        break;

      case "custom":  // ✅ FIXED (was manual)
        resolvedValue = config.value;
        break;

      default:
        resolvedValue = config.value;
    }

    // ✅ IMPORTANT FIX: prevent empty replacement
    if (!resolvedValue) {
      console.warn(`⚠️ Empty value for {{${key}}}`);
      resolvedValue = `{{${key}}}`; // keep placeholder
    }

    console.log(`➡️ {{${key}}} →`, resolvedValue);

    message = message.replace(placeholder, resolvedValue);
  });

  // ❌ REMOVE THIS (VERY IMPORTANT)
  // message = message.replace(/\{\{\d+\}\}/g, "");

  console.log("✅ FINAL MESSAGE:", message);

  return message;
}

module.exports = resolveTemplate;