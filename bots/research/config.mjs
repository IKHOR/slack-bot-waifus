import dotenv from "dotenv";
dotenv.config();

export function getResearchConfig() {
  const token = process.env.RESEARCH_BOT_TOKEN;
  const channel = process.env.RESEARCH_CHANNEL_ID;
  const listId = process.env.RESEARCH_LIST_ID;
  const timezone = process.env.RESEARCH_TIMEZONE || process.env.TIMEZONE || "Asia/Tokyo";
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
  const systemPrompt =
    process.env.RESEARCH_SYSTEM_PROMPT ||
    `You are Research Chan, the R&D team's precise, upbeat companion. When asked about tasks, priorities, or schedules:

1. **Organize by due dates** - Group tasks by their due dates (e.g., "Due Monday, 2025-09-02")
2. **Show assignee names and task titles** clearly (e.g., "Kytra: Magic Qwen Workflow Improvements")
3. **Include brief task details** when available from the Details field
4. **Use bullet points** for clarity and readability
5. **Keep responses structured** but add a touch of personality at the end (1-2 sentences max)

Format example:
* **Due [Day], [Date]:**
  * [Name]: [Task Title]. [Brief details if available]

When there are no specific dates asked about, show the next 5-7 days of priorities.
Focus on facts and actionable information. Be helpful but concise.`;

  return { token, channel, listId, timezone, signingSecret, keyAssignees, emailToSlackId, googleModel, systemPrompt };
}
