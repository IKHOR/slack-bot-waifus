import { WebClient } from "@slack/web-api";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import dotenv from "dotenv";
import process from "node:process";

dotenv.config();
dayjs.extend(utc);
dayjs.extend(timezone);

const token = process.env.BOT_TOKEN_RESEARCH_CHAN || process.env.SLACK_BOT_TOKEN;
// DM channel for testing/personal updates
const channel = "D09D35DP9UK"; // DM to @jaxn - hardcoded for testing
// const channel = process.env.CHANNEL_ID_RND_GENERAL || process.env.CHANNEL_ID; // For production (commented out)
const listId = process.env.LIST_ID_RND || process.env.LIST_ID;
const tz = process.env.TIMEZONE || "Asia/Tokyo";

// Key assignees to track (by email for configuration)
const KEY_ASSIGNEES = ["kytra@ikhor.ai", "ryo@ikhor.ai", "joao@ikhor.ai"];

if (!token || !channel) {
  console.error("Missing SLACK_BOT_TOKEN or CHANNEL_ID");
  process.exit(1);
}

const slack = new WebClient(token);

const PRIORITY_ORDER = {
  "P0": 0,
  "P1": 1,
  "P2": 2,
  "P3": 3,
  "P4": 4,
  "None": 99
};

function getPriorityEmoji(priority) {
  switch(priority) {
    case "P0": return "🔴";
    case "P1": return "🟠";
    default: return "";
  }
}

// Static fallback map of email -> Slack user ID (override with accurate IDs)
const emailToSlackId = {
  "kytra@ikhor.ai": "U06K8F0F1RC",  // Fixed: was using jaxn's ID
  "ryo@ikhor.ai": "U09BTLXG89G",    // Fixed: was using kytra's ID
  "joao@ikhor.ai": "U06L088EW7K",
  "kijai@ikhor.ai": "U0798RS2ESX",
  "jackson@ikhor.ai": "U06KJLR4GBF",
  "todd@ikhor.ai": "U079Z6D4YFJ",   // Fixed: wrong ID
  "kush@ikhor.ai": "U07584FHQMN",   // Fixed: wrong ID
  "jaxn@ikhor.ai": "U06KJLR4GBF"
};

// Resolve Slack IDs for configured emails using Slack API (fallback to static map)
async function resolveAssigneeIds(emails) {
  const resolved = {};
  for (const email of emails) {
    // Fallback first, in case API scope isn't available
    if (emailToSlackId[email]) {
      resolved[email] = emailToSlackId[email];
    }
    try {
      // Requires users:read.email scope
      const resp = await slack.users.lookupByEmail({ email });
      if (resp && resp.ok && resp.user && resp.user.id) {
        resolved[email] = resp.user.id;
      }
    } catch (_) {
      // Ignore errors, stick with fallback mapping
    }
  }
  return resolved;
}

async function fetchListSchema() {
  try {
    console.log(`Fetching schema for list ${listId}...`);
    
    const response = await slack.apiCall("slackLists.get", {
      list_id: listId
    });

    if (!response.ok) {
      console.error("Failed to fetch list schema:", response.error);
      return null;
    }

    return response.list || null;
  } catch (error) {
    console.error("Error fetching list schema:", error);
    return null;
  }
}

async function fetchListItems() {
  try {
    if (!listId) {
      console.log("No LIST_ID configured, skipping list fetch");
      return [];
    }

    console.log(`Fetching items from list ${listId}...`);
    
    const response = await slack.apiCall("slackLists.items.list", {
      list_id: listId,
      limit: 200
    });

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

// Map status option IDs to readable status names
// Based on analysis: Col093T8A25LG contains the status/bucket field
// Verified mapping through cross-referencing with CSV data
const STATUS_OPTIONS = {
  "Opt2AUH34OG": "ToDo",          // ToDo (with some Backlog)
  "Opt62NHHN5C": "ToDo",          // ToDo items
  "OptHSJVP60E": "In Progress",   // In Progress items
  "OptHX1KN4IP": "Deprecated",    // Deprecated items - EXCLUDE
  "OptZHYHCA4A": "Backlog",       // Backlog items - EXCLUDE  
  "Opt38B8RWRR": "Complete",      // Mostly Complete items - EXCLUDE
  // Note: We NO LONGER use todo_completed field
};

function parseListItem(item) {
  const fieldsArray = item.fields || [];
  
  // Map to store field values by their column ID patterns
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
  
  // Process fields - they're indexed numerically in the raw data
  // Based on the CSV, the columns appear in a specific order
  fieldsArray.forEach((field, index) => {
    // Assignee field - specifically look for todo_assignee
    if (field.key === "todo_assignee" && field.user && field.user.length > 0) {
      assigneeId = field.user[0];
    }
    
    // Title/name: prefer canonical keys
    if ((field.key === "name" || field.key === "title") && field.text) {
      title = field.text;
    } else if (!title && field.text) {
      title = field.text;
    }
    
    // Check for date values (due dates) - specifically todo_due_date
    if (field.key === "todo_due_date" && field.value) {
      due = field.value;
    }
    
    // Check for completion status
    if (field.key === "todo_completed") {
      isCompleted = field.value === true;
    }
    
    // Check for status/bucket column (Col093T8A25LG)
    if (field.key === "Col093T8A25LG" && field.value) {
      statusOption = field.value;
      status = STATUS_OPTIONS[field.value] || "Unknown";
    }
    
    // Priority dropdown column: Col08V4T02P5Y (verified against known priorities)
    // This field has consistent 1:1 mapping to priority levels
    if (field.key === "Col08V4T02P5Y" && field.value) {
      priorityOption = field.value;
      const mapped = PRIORITY_OPTIONS_MAP[field.value];
      if (mapped) {
        priority = mapped;
      }
    }
  });
  
  // Extract priority from title as a fallback if dropdown not present/unknown
  // Look for patterns like "p0", "P1", "p2" etc in the title
  const priorityMatch = title.match(/\b[Pp]([0-4])\b/);
  if (priorityMatch) {
    priority = "P" + priorityMatch[1];
    // Clean the priority from the title for better display
    title = title.replace(/^\s*[Pp][0-4]\s*:?\s*/, '');
  }
  
  // Don't override based on todo_completed - use the actual status dropdown
  // If status is unknown, default to "Unknown" (will be filtered out)
  if (status === "Unknown") {
    status = "Unknown";
  }
  
  // Construct permalink to the specific list item
  // Format: https://ikhorlabs.slack.com/lists/{team_id}/{list_id}?record_id={item_id}
  const teamId = "T06K7221F6C"; // iKHOR Labs team ID
  const permalink = `https://ikhorlabs.slack.com/lists/${teamId}/${listId}?record_id=${item.id}`;
  
  return {
    id: item.id,
    title,
    assigneeId,
    priority,
    due,
    status,
    department,
    description,
    permalink,
    isCompleted
  };
}

function filterRelevantItems(items) {
  // Only include items that are in ToDo or In Progress status
  // EXCLUDE: Complete, Deprecated, Backlog, Unknown
  // AND are P0, P1, P2, or P3 priority
  return items.filter(item => {
    // Check status - must be ToDo or In Progress (exclude Complete, Deprecated, Backlog)
    const validStatus = item.status === "ToDo" || item.status === "In Progress";
    
    // Check priority - must be P0, P1, P2, or P3
    const validPriority = item.priority === "P0" || item.priority === "P1" || 
                         item.priority === "P2" || item.priority === "P3";
    
    return validStatus && validPriority;
  });
}

function groupByAssignee(items) {
  const grouped = {};
  
  items.forEach(item => {
    if (!item.assigneeId) return;
    // Only group P0, P1, P2, P3 items
    if (item.priority !== "P0" && item.priority !== "P1" && 
        item.priority !== "P2" && item.priority !== "P3") return;
    
    if (!grouped[item.assigneeId]) {
      grouped[item.assigneeId] = [];
    }
    grouped[item.assigneeId].push(item);
  });
  
  // Sort items within each assignee by priority
  Object.keys(grouped).forEach(assignee => {
    grouped[assignee].sort((a, b) => {
      const aPriority = PRIORITY_ORDER[a.priority] ?? 99;
      const bPriority = PRIORITY_ORDER[b.priority] ?? 99;
      return aPriority - bPriority;
    });
  });
  
  return grouped;
}

function findUrgentItems(items) {
  const now = dayjs().tz(tz).startOf('day');

  const urgent = [];
  const overdue = [];

  items.forEach(item => {
    if (!item.due) return;
    
    // Only include ToDo or In Progress items (exclude Complete, Deprecated, Backlog)
    if (item.status !== "ToDo" && item.status !== "In Progress") return;

    const dueDate = dayjs(item.due).tz(tz).startOf('day');

    if (dueDate.isBefore(now)) {
      overdue.push(item);
      return;
    }

    const daysUntil = dueDate.diff(now, 'day');
    if (daysUntil === 0 || daysUntil === 1) {
      urgent.push({ ...item, daysUntil });
    }
  });

  return { urgent, overdue };
}

async function buildDigestBlocks(items, allItems, assigneeIdMap) {
  const relevantItems = filterRelevantItems(items);
  const groupedByAssignee = groupByAssignee(relevantItems);
  // Only include P0-P3 items in urgency sections
  const priorityItems = allItems.filter(item => 
    (item.priority === "P0" || item.priority === "P1" || 
     item.priority === "P2" || item.priority === "P3") &&
    (item.status === "ToDo" || item.status === "In Progress")
  );
  const { urgent, overdue } = findUrgentItems(priorityItems);

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "💚🧪✨ Research Chan - Daily Update ✨🧪💚",
        emoji: true
      }
    },
    {
      type: "divider"
    }
  ];
  
  // Overdue items alert
  if (overdue.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `💢 *OVERDUE ITEMS REQUIRING IMMEDIATE ATTENTION* 💢`
      }
    });

    overdue.forEach(item => {
      const assigneeMention = item.assigneeId ? `<@${item.assigneeId}>` : "Unassigned";

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• ❤️ ${assigneeMention} <${item.permalink}|${item.title}> | ${item.priority}`
        }
      });
    });

    blocks.push({ type: "divider" });
  }
  
  // Urgent items (due in next 2 days)
  if (urgent.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⏰ Items Due Soon (Next 2 Days)`
      }
    });

    urgent.forEach(item => {
      const assigneeMention = item.assigneeId ? `<@${item.assigneeId}>` : "Unassigned";
      const dueText = item.daysUntil === 0 ? " (Due today)" : " (Due tomorrow)";

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `• 🧡 ${assigneeMention} <${item.permalink}|${item.title}> | ${item.priority}${dueText}`
        }
      });
    });

    blocks.push({ type: "divider" });
  }
  
  // Top priorities for key assignees
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `📋 Top Priorities for the Day`
    }
  });
  
  KEY_ASSIGNEES.forEach(email => {
    const slackId = assigneeIdMap[email] || emailToSlackId[email];
    const userItems = slackId ? groupedByAssignee[slackId] : undefined;
    const mention = slackId ? `<@${slackId}>` : `@${email.split('@')[0]}`;
    
    if (!userItems || userItems.length === 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${mention}:\nNo items left To Do`
        }
      });
    } else {
      // Get the highest priority item
      const topItem = userItems[0];

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${mention}:\n✅ Top Priority: <${topItem.permalink}|${topItem.title}> | ${topItem.priority}`
        }
      });
    }
  });
  
  // Closing prompt
  const kytraId = (assigneeIdMap && assigneeIdMap["kytra@ikhor.ai"]) || emailToSlackId["kytra@ikhor.ai"];
  if (kytraId) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<@${kytraId}> -chan ~ what is the big focus for today? 😘`
      }
    });
  }
  
  return blocks;
}

// Priority dropdown (Col08V4T02P5Y) option mapping
// Verified against 50+ known priority items from CSV data
// This field has consistent 1:1 mapping between option IDs and priority levels
const PRIORITY_OPTIONS_MAP = {
  "Opt0183CXDH": "P0",
  "Opt4GBWBKZB": "P1",
  "OptGESIX7LE": "P2",
  "Opt24AKKH4V": "P3"
};

async function run() {
  try {
    console.log("Starting Research Chan daily update...");
    
    const items = await fetchListItems();
    
    if (items.length === 0) {
      console.log("No items found in list");
      await slack.chat.postMessage({
        channel,
        text: "No items found in the priority list today."
      });
      return;
    }
    
    const parsedItems = items.map(parseListItem);
    const assigneeIdMap = await resolveAssigneeIds(KEY_ASSIGNEES);
    const blocks = await buildDigestBlocks(parsedItems, parsedItems, assigneeIdMap);
    
    // Log the message content for debugging
    console.log("\n=== MESSAGE PREVIEW ===");
    console.log("Channel:", channel);
    console.log("\nBlocks being sent:");
    blocks.forEach((block, idx) => {
      if (block.type === "header") {
        console.log(`[${idx}] Header: ${block.text.text}`);
      } else if (block.type === "section") {
        console.log(`[${idx}] Section: ${block.text.text}`);
      } else if (block.type === "divider") {
        console.log(`[${idx}] --- Divider ---`);
      }
    });
    console.log("=== END PREVIEW ===\n");
    
    await slack.chat.postMessage({
      channel,
      text: "Research Chan - Daily Update",
      blocks
    });
    
    console.log("Successfully posted daily update");
  } catch (error) {
    console.error("Failed to run daily update:", error);
    
    try {
      await slack.chat.postMessage({
        channel,
        text: `❌ Daily update failed: ${error.message}`
      });
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
