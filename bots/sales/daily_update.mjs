import dotenv from "dotenv";
import process from "node:process";
import { createClient } from "../../src/lib/slack.mjs";
import { dayjs } from "../../src/lib/time.mjs";
import { getSalesConfig } from "./config.mjs";

dotenv.config();

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, None: 99 };

// Sales field mappings (from export cross-reference)
const SALES_STATUS_MAP = {
  OptTR35W8NA: "Done",
  Opt7MNHB19N: "Not started",
  OptXBPNOYKC: "In progress",
  OptZHAUQFJX: "Delayed",
  OptFRBZND04: "Pending Response",
  OptX4J6I8OQ: "Re-Visit (Sep+)",
};

const SALES_PRIORITY_MAP = {
  OptLB9I51KK: "P0",
  OptYBKVVSJL: "P1",
  OptKUQNIOIF: "P2",
  OptLYP9IY01: "P3",
};

function parseListItem(item, listId) {
  const fieldsArray = item.fields || [];
  let title = "Untitled";
  let assigneeId = null;
  let due = null;
  let priority = "None";
  let status = "Unknown";

  fieldsArray.forEach((field) => {
    if (field.key === "name" && field.text) title = field.text;
    if (field.key === "Col07R4NKTN3B" && field.user && field.user.length > 0) assigneeId = field.user[0];
    if (field.key === "Col07QUHA36DS" && field.value) due = field.value; // YYYY-MM-DD
    if (field.key === "people" && field.value) status = SALES_STATUS_MAP[field.value] || "Unknown";
    if (field.key === "date" && field.value) priority = SALES_PRIORITY_MAP[field.value] || "None";
  });

  // Fallback: title prefix like p0/p1 if present
  const priorityMatch = title.match(/\b[Pp]([0-3])\b/);
  if (priorityMatch) {
    priority = "P" + priorityMatch[1];
    title = title.replace(/^\s*[Pp][0-3]\s*:?\s*/, "");
  }

  const teamId = "T06K7221F6C";
  const permalink = `https://ikhorlabs.slack.com/lists/${teamId}/${listId}?record_id=${item.id}`;
  return { id: item.id, title, assigneeId, priority, due, status, permalink };
}

function filterRelevantItems(items) {
  // Only not started / in progress with priority P0-P3
  return items.filter((item) => {
    const validStatus = item.status === "Not started" || item.status === "In progress";
    const validPriority = item.priority === "P0" || item.priority === "P1" || item.priority === "P2" || item.priority === "P3";
    return validStatus && validPriority;
  });
}

function findUrgentItems(items, tz) {
  const now = dayjs().tz(tz).startOf("day");
  const urgent = [];
  const overdue = [];
  items.forEach((item) => {
    if (!item.due) return;
    const dueDate = dayjs(item.due).tz(tz).startOf("day");
    if (dueDate.isBefore(now)) {
      overdue.push(item);
      return;
    }
    const daysUntil = dueDate.diff(now, "day");
    if (daysUntil === 0 || daysUntil === 1) urgent.push({ ...item, daysUntil });
  });
  return { urgent, overdue };
}

async function fetchListItems(slack, listId) {
  try {
    if (!listId) {
      console.log("No SALES LIST_ID configured, skipping list fetch");
      return [];
    }
    console.log(`Fetching items from list ${listId}...`);
    const response = await slack.apiCall("slackLists.items.list", { list_id: listId, limit: 400 });
    if (!response.ok) {
      console.error("Failed to fetch list:", response.error);
      return [];
    }
    return response.items || [];
  } catch (error) {
    console.error("Error fetching list items:", error);
    return [];
  }
}

async function buildDigestBlocks(items, tz) {
  const relevant = filterRelevantItems(items);
  const { urgent, overdue } = findUrgentItems(relevant, tz);

  const blocks = [
    { type: "header", text: { type: "plain_text", text: "📞💓♠️ Sales Chan - Daily Update ♠️💓📞", emoji: true } },
    { type: "divider" },
  ];

  if (overdue.length > 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `💢 *OVERDUE ITEMS REQUIRING IMMEDIATE ATTENTION* 💢` } });
    overdue.forEach((item) => {
      const mention = item.assigneeId ? `<@${item.assigneeId}>` : "Unassigned";
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `• ❤️ ${mention} <${item.permalink}|${item.title}> | ${item.priority}` } });
    });
    blocks.push({ type: "divider" });
  }

  if (urgent.length > 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `⏰ Items Due Soon (Next 2 Days)` } });
    urgent.forEach((item) => {
      const mention = item.assigneeId ? `<@${item.assigneeId}>` : "Unassigned";
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `• 🧡 ${mention} <${item.permalink}|${item.title}> | ${item.priority}` } });
    });
  }

  return blocks;
}

export async function run() {
  const { token, channel, listId, timezone: tz, dmRecipients, emailToSlackId } = getSalesConfig();
  if (!token || !channel) {
    console.error("Missing bot token or channel for Sales bot");
    process.exit(1);
  }
  const slack = createClient(token);
  try {
    console.log("Starting Sales Chan daily update...");
    const raw = await fetchListItems(slack, listId);
    if (raw.length === 0) {
      console.log("No items found in sales list");
      await slack.chat.postMessage({ channel, text: "No items found in the sales list today." });
      return;
    }
    const parsed = raw.map((it) => parseListItem(it, listId));
    const blocks = await buildDigestBlocks(parsed, tz);

    // Debug preview
    console.log("\n=== SALES MESSAGE PREVIEW ===");
    blocks.forEach((b, i) => {
      if (b.type === "header") console.log(`[${i}] Header: ${b.text.text}`);
      if (b.type === "section") console.log(`[${i}] Section: ${b.text.text}`);
      if (b.type === "divider") console.log(`[${i}] --- Divider ---`);
    });
    console.log("=== END PREVIEW ===\n");

    // Send GROUP DM to specified recipients instead of posting to channel
    if (dmRecipients && dmRecipients.length > 0) {
      console.log(`Creating group DM for: ${dmRecipients.join(", ")}`);
      
      // Resolve recipient IDs by email
      const recipientIds = [];
      for (const email of dmRecipients) {
        if (emailToSlackId[email]) { 
          recipientIds.push(emailToSlackId[email]); 
          console.log(`Found ID for ${email}: ${emailToSlackId[email]}`);
          continue; 
        }
        try {
          const resp = await slack.users.lookupByEmail({ email });
          if (resp?.ok && resp.user?.id) {
            recipientIds.push(resp.user.id);
            console.log(`Looked up ID for ${email}: ${resp.user.id}`);
          }
        } catch (e) {
          console.error(`Failed to lookup ${email}:`, e.message);
        }
      }
      
      // Create or open a group DM with all recipients
      const uniqueIds = [...new Set(recipientIds)].filter(Boolean);
      if (uniqueIds.length > 0) {
        try {
          // Open a multi-person DM (MPIM) with all recipients
          const dmResp = await slack.conversations.open({ users: uniqueIds.join(",") });
          if (dmResp?.ok && dmResp.channel?.id) {
            await slack.chat.postMessage({ 
              channel: dmResp.channel.id, 
              text: "Sales Chan - Daily Update", 
              blocks 
            });
            console.log(`✅ Sent group DM to ${uniqueIds.length} recipients`);
          } else {
            console.error("Failed to open group DM:", dmResp);
          }
        } catch (e) {
          console.error(`Failed to send group DM:`, e.message);
        }
      } else {
        console.warn("No valid recipient IDs found");
      }
    } else {
      console.warn("No DM recipients configured, skipping DM send");
    }
    console.log("Successfully posted sales daily update");
  } catch (error) {
    console.error("Failed to run sales daily update:", error);
    try {
      await slack.chat.postMessage({ channel, text: `❌ Sales daily update failed: ${error.message}` });
    } catch (notifyError) {
      console.error("Failed to notify about error:", notifyError);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
