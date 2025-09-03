import dotenv from "dotenv";
dotenv.config();

export function getSalesConfig() {
  const token = process.env.SALES_BOT_TOKEN;
  const channel = process.env.SALES_CHANNEL_ID;
  const listId = process.env.SALES_LIST_ID;
  const timezone = process.env.SALES_TIMEZONE || process.env.TIMEZONE || "Asia/Tokyo";
  const signingSecret = process.env.SALES_SIGNING_SECRET;

  // Optional: comma-separated list of emails
  const keyAssignees = (process.env.SALES_KEY_ASSIGNEES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Shared fallback mapping (adjust as needed)
  const emailToSlackId = {
    "kytra@ikhor.ai": "U06K8F0F1RC",
    "ryo@ikhor.ai": "U09BTLXG89G",
    "joao@ikhor.ai": "U06L088EW7K",
    "kijai@ikhor.ai": "U0798RS2ESX",
    "jackson@ikhor.ai": "U06KJLR4GBF",
    "todd@ikhor.ai": "U079Z6D4YFJ",
    "kush@ikhor.ai": "U07584FHQMN",
    "jaxn@ikhor.ai": "U06KJLR4GBF",
    "hilary@ikhor.ai": undefined,
    "coco@ikhor.ai": undefined,
  };

  // LLM & persona
  const googleModel = process.env.SALES_GOOGLE_MODEL || process.env.GOOGLE_MODEL || "gemini-1.5-pro";
  const systemPrompt =
    process.env.SALES_SYSTEM_PROMPT ||
    "You are Sales Chan, a focused, friendly sales teammate. Be concise and actionable (3–6 lines), prioritize pipeline movement, qualification, and next steps. Use Slack-friendly bullets and keep tone positive and professional.";

  // DM recipients: comma-separated emails
  const dmRecipients = (process.env.SALES_DM_RECIPIENTS ||
    "jackson@ikhor.ai,todd@ikhor.ai,hilary@ikhor.ai,coco@ikhor.ai")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return { token, channel, listId, timezone, signingSecret, keyAssignees, emailToSlackId, googleModel, systemPrompt, dmRecipients };
}
