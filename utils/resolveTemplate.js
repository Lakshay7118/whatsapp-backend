function resolveTemplate(format, variables, contact) {
  let message = format;

  const vars = variables instanceof Map
    ? Object.fromEntries(variables)
    : (variables || {});

  Object.entries(vars).forEach(([key, config]) => {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    let resolvedValue = "";

    switch (config.type) {
      case "name":
        resolvedValue = (contact?.name && contact.name !== "UNKNOWN")
          ? contact.name
          : "Customer";
        break;
      case "number":
        resolvedValue = contact?.mobile || "";
        break;
      case "manual":
        resolvedValue = config.value || "";
        break;
      default:
        resolvedValue = config.value || "";
    }

    message = message.replace(placeholder, resolvedValue);
  });

  // Clean up any unreplaced placeholders
  message = message.replace(/\{\{\d+\}\}/g, "");
  return message;
}

module.exports = resolveTemplate;