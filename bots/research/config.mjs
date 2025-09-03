import dotenv from "dotenv";
dotenv.config();

export function getResearchConfig() {
  const token = process.env.RESEARCH_BOT_TOKEN;
  const channel = process.env.RESEARCH_CHANNEL_ID;
  const listId = process.env.RESEARCH_LIST_ID;
  const timezone = process.env.TIMEZONE || "Asia/Tokyo";
  const signingSecret = process.env.RESEARCH_SIGNING_SECRET;

  // Comma-separated list of emails, or default list
  const keyAssignees = (process.env.RESEARCH_KEY_ASSIGNEES || "kytra@ikhor.ai,ryo@ikhor.ai,joao@ikhor.ai")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Static fallback map of email -> Slack user ID (override with accurate IDs)
  const emailToSlackId = {
    "kytra@ikhor.ai": "U06K8F0F1RC",
    "ryo@ikhor.ai": "U09BTLXG89G",
    "joao@ikhor.ai": "U06L088EW7K",
    "kijai@ikhor.ai": "U0798RS2ESX",
    "jackson@ikhor.ai": "U06KJLR4GBF",
    "todd@ikhor.ai": "U079Z6D4YFJ",
    "kush@ikhor.ai": "U07584FHQMN",
    "jaxn@ikhor.ai": "U06KJLR4GBF",
  };

  // LLM & persona
  const googleModel = process.env.RESEARCH_GOOGLE_MODEL || process.env.GOOGLE_MODEL || "gemini-1.5-pro";
  const systemPrompt = process.env.RESEARCH_SYSTEM_PROMPT || "You are Research Chan, the R&D team's companion. Provide task updates organized by date.";

  return { token, channel, listId, timezone, signingSecret, keyAssignees, emailToSlackId, googleModel, systemPrompt };
}
