import dotenv from "dotenv";
import process from "node:process";
import { createClient } from "../../src/lib/slack.mjs";
import { dayjs } from "../../src/lib/time.mjs";
import { getResearchConfig } from "./config.mjs";

dotenv.config();

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, None: 99 };

// Priority dropdown (Col08V4T02P5Y) option mapping
const PRIORITY_OPTIONS_MAP = {
  "Opt0183CXDH": "P0",
  "Opt4GBWBKZB": "P1",
  "OptGESIX7LE": "P2",
  "Opt24AKKH4V": "P3",
};

// Map status option IDs to readable status names
const STATUS_OPTIONS = {
  "Opt2AUH34OG": "ToDo",
  "Opt62NHHN5C": "In Review",  // Fixed: was incorrectly mapped to ToDo
  "OptHSJVP60E": "In Progress",
  "OptHX1KN4IP": "Deprecated",
  "OptZHYHCA4A": "Backlog",
  "Opt38B8RWRR": "Complete",
};

function getPriorityEmoji(priority) {
  switch (priority) {
    case "P0":
      return "🔴";
    case "P1":
      return "🟠";
    default:
      return "";
  }
}

async function resolveAssigneeIds(slack, emails, fallbackMap) {
  const resolved = {};
  for (const email of emails) {
    if (fallbackMap[email]) resolved[email] = fallbackMap[email];
    try {
      const resp = await slack.users.lookupByEmail({ email });
      if (resp && resp.ok && resp.user && resp.user.id) {
        resolved[email] = resp.user.id;
      }
    } catch (_) {
      // ignore
    }
  }
  return resolved;
}

async function fetchListItems(slack, listId) {
  try {
    if (!listId) {
      console.log("No LIST_ID configured, skipping list fetch");
      return [];
    }
    console.log(`Fetching items from list ${listId}...`);
    const response = await slack.apiCall("slackLists.items.list", { list_id: listId, limit: 200 });
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

function parseListItem(item, listId) {
  const fieldsArray = item.fields || [];
  let title = "Untitled";
  let assigneeId = null;
  let due = null;
  let isCompleted = false;
  let priority = "None";
  let status = "Unknown";
  let statusOption = null;
  let priorityOption = null;
  let department = "";
  let description = "";

  fieldsArray.forEach((field) => {
    if (field.key === "todo_assignee" && field.user && field.user.length > 0) {
      assigneeId = field.user[0];
    }
    if ((field.key === "name" || field.key === "title") && field.text) {
      title = field.text;
    } else if (!title && field.text) {
      title = field.text;
    }
    if (field.key === "todo_due_date" && field.value) {
      due = field.value;
    }
    if (field.key === "todo_completed") {
      isCompleted = field.value === true;
    }
    if (field.key === "Col093T8A25LG" && field.value) {
      statusOption = field.value;
      status = STATUS_OPTIONS[field.value] || "Unknown";
    }
    if (field.key === "Col08V4T02P5Y" && field.value) {
      priorityOption = field.value;
      const mapped = PRIORITY_OPTIONS_MAP[field.value];
      if (mapped) {
        priority = mapped;
      }
    }
  });

  const priorityMatch = title.match(/\b[Pp]([0-4])\b/);
  if (priorityMatch) {
    priority = "P" + priorityMatch[1];
    title = title.replace(/^\s*[Pp][0-4]\s*:?\s*/, "");
  }

  if (status === "Unknown") {
    status = "Unknown";
  }

  const teamId = "T06K7221F6C"; // Workspace team ID
  const permalink = `https://ikhorlabs.slack.com/lists/${teamId}/${listId}?record_id=${item.id}`;

  return { id: item.id, title, assigneeId, priority, due, status, department, description, permalink, isCompleted };
}

function filterRelevantItems(items) {
  return items.filter((item) => {
    const validStatus = item.status === "ToDo" || item.status === "In Progress";
    const validPriority = item.priority === "P0" || item.priority === "P1" || item.priority === "P2" || item.priority === "P3";
    return validStatus && validPriority;
  });
}

function groupByAssignee(items) {
  const grouped = {};
  items.forEach((item) => {
    if (!item.assigneeId) return;
    if (item.priority !== "P0" && item.priority !== "P1" && item.priority !== "P2" && item.priority !== "P3") return;
    if (!grouped[item.assigneeId]) grouped[item.assigneeId] = [];
    grouped[item.assigneeId].push(item);
  });
  Object.keys(grouped).forEach((assignee) => {
    grouped[assignee].sort((a, b) => {
      const aPriority = PRIORITY_ORDER[a.priority] ?? 99;
      const bPriority = PRIORITY_ORDER[b.priority] ?? 99;
      return aPriority - bPriority;
    });
  });
  return grouped;
}

function findUrgentItems(items, tz) {
  const now = dayjs().tz(tz).startOf("day");
  const urgent = [];
  const overdue = [];
  items.forEach((item) => {
    if (!item.due) return;
    if (item.status !== "ToDo" && item.status !== "In Progress") return;
    const dueDate = dayjs(item.due).tz(tz).startOf("day");
    if (dueDate.isBefore(now)) {
      overdue.push(item);
      return;
    }
    const daysUntil = dueDate.diff(now, "day");
    if (daysUntil === 0 || daysUntil === 1) {
      urgent.push({ ...item, daysUntil });
    }
  });
  return { urgent, overdue };
}

async function buildDigestBlocks(items, allItems, assigneeIdMap, tz, keyAssignees, emailToSlackId) {
  const relevantItems = filterRelevantItems(items);
  const groupedByAssignee = groupByAssignee(relevantItems);
  const priorityItems = allItems.filter(
    (item) =>
      (item.priority === "P0" || item.priority === "P1" || item.priority === "P2" || item.priority === "P3") &&
      (item.status === "ToDo" || item.status === "In Progress")
  );
  const { urgent, overdue } = findUrgentItems(priorityItems, tz);

  const blocks = [
    { type: "header", text: { type: "plain_text", text: "💚🧪✨ Research Chan - Daily Update ✨🧪💚", emoji: true } },
    { type: "divider" },
  ];

  if (overdue.length > 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `💢 *OVERDUE ITEMS REQUIRING IMMEDIATE ATTENTION* 💢` } });
    overdue.forEach((item) => {
      const assigneeMention = item.assigneeId ? `<@${item.assigneeId}>` : "Unassigned";
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `• ❤️ ${assigneeMention} <${item.permalink}|${item.title}> | ${item.priority}` } });
    });
    blocks.push({ type: "divider" });
  }

  if (urgent.length > 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `⏰ Items Due Soon (Next 2 Days)` } });
    urgent.forEach((item) => {
      const assigneeMention = item.assigneeId ? `<@${item.assigneeId}>` : "Unassigned";
      const dueText = item.daysUntil === 0 ? " (Due today)" : " (Due tomorrow)";
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `• 🧡 ${assigneeMention} <${item.permalink}|${item.title}> | ${item.priority}${dueText}` } });
    });
    blocks.push({ type: "divider" });
  }

  blocks.push({ type: "section", text: { type: "mrkdwn", text: `📋 Top Priorities for the Day` } });

  keyAssignees.forEach((email) => {
    const slackId = assigneeIdMap[email] || emailToSlackId[email];
    const userItems = slackId ? groupedByAssignee[slackId] : undefined;
    const mention = slackId ? `<@${slackId}>` : `@${email.split("@")[0]}`;
    if (!userItems || userItems.length === 0) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `${mention}:\nNo items left To Do` } });
    } else {
      const topItem = userItems[0];
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `${mention}:\n✅ Top Priority: <${topItem.permalink}|${topItem.title}> | ${topItem.priority}` } });
    }
  });

  const kytraId = (assigneeIdMap && assigneeIdMap["kytra@ikhor.ai"]) || emailToSlackId["kytra@ikhor.ai"];
  if (kytraId) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `<@${kytraId}> -chan ~ what is the big focus for today? 😘` } });
  }

  return blocks;
}

export async function run() {
  const { token, channel, listId, timezone: tz, keyAssignees, emailToSlackId } = getResearchConfig();
  if (!token || !channel) {
    console.error("Missing bot token or channel for Research bot");
    process.exit(1);
  }
  const slack = createClient(token);

  try {
    console.log("Starting Research Chan daily update...");
    const items = await fetchListItems(slack, listId);
    if (items.length === 0) {
      console.log("No items found in list");
      await slack.chat.postMessage({ channel, text: "No items found in the priority list today." });
      return;
    }
    const parsedItems = items.map((i) => parseListItem(i, listId));
    const assigneeIdMap = await resolveAssigneeIds(slack, keyAssignees, emailToSlackId);
    const blocks = await buildDigestBlocks(parsedItems, parsedItems, assigneeIdMap, tz, keyAssignees, emailToSlackId);

    console.log("\n=== MESSAGE PREVIEW ===");
    console.log("Channel:", channel);
    console.log("\nBlocks being sent:");
    blocks.forEach((block, idx) => {
      if (block.type === "header") console.log(`[${idx}] Header: ${block.text.text}`);
      else if (block.type === "section") console.log(`[${idx}] Section: ${block.text.text}`);
      else if (block.type === "divider") console.log(`[${idx}] --- Divider ---`);
    });
    console.log("=== END PREVIEW ===\n");

    await slack.chat.postMessage({ channel, text: "Research Chan - Daily Update", blocks });
    console.log("Successfully posted daily update");
  } catch (error) {
    console.error("Failed to run daily update:", error);
    try {
      const slack = createClient(token);
      await slack.chat.postMessage({ channel, text: `❌ Daily update failed: ${error.message}` });
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

