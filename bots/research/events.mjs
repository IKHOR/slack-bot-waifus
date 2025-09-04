import express from "express";
import { generateLLMReply } from "../../src/lib/llm.mjs";
import { dayjs } from "../../src/lib/time.mjs";
import { getResearchConfig } from "./config.mjs";

export function createResearchEventsRouter({ slack, helpMessage }) {
  const router = express.Router();

  function stripMentions(text) {
    return (text || "")
      .replace(/<@[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function loadThreadSnippet(channel, ts, limit = 8, maxChars = 1200) {
    try {
      const resp = await slack.conversations.replies({ channel, ts, limit });
      const msgs = resp.messages || [];
      const parts = msgs
        .map((m) => (m.text || "").replace(/<@([^>]+)>/g, "@$1"))
        .filter(Boolean);
      let snippet = "";
      for (const p of parts.reverse()) {
        if (snippet.length + p.length + 2 > maxChars) break;
        snippet = p + "\n" + snippet;
      }
      return snippet.trim();
    } catch (e) {
      return "";
    }
  }

  // Slack Lists helpers (kept local to avoid heavy refactor)
  async function fetchListItems(slack, listId) {
    try {
      if (!listId) return [];
      const response = await slack.apiCall("slackLists.items.list", { list_id: listId, limit: 200 });
      if (!response.ok) return [];
      return response.items || [];
    } catch {
      return [];
    }
  }

  const STATUS_OPTIONS = {
    "Opt2AUH34OG": "ToDo",
    "Opt62NHHN5C": "In Review",  // Fixed: was incorrectly mapped to ToDo
    "OptHSJVP60E": "In Progress",
    "OptHX1KN4IP": "Deprecated",
    "OptZHYHCA4A": "Backlog",
    "Opt38B8RWRR": "Complete",
  };
  const PRIORITY_OPTIONS_MAP = {
    "Opt0183CXDH": "P0",
    "Opt4GBWBKZB": "P1",
    "OptGESIX7LE": "P2",
    "Opt24AKKH4V": "P3",
  };
  const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, None: 99 };
  
  // User ID to name mapping
  const USER_NAMES = {
    "U06L088EW7K": "Joao",
    "U06K8F0F1RC": "Kytra",
    "U09BTLXG89G": "Ryo",
    "U06KJLR4GBF": "Jackson",
    "U06LABYK33J": "Khai",
    "U0798RS2ESX": "Kijai",
    "U079Z6D4YFJ": "Todd",
    "U07584FHQMN": "Kush",
  };
  
  function getUserName(userId) {
    return USER_NAMES[userId] || (userId ? `<@${userId}>` : "Unassigned");
  }

  function parseListItemForContext(raw, listId) {
    const fields = raw.fields || [];
    let title = "Untitled";
    let assigneeId = null;
    let due = null;
    let status = "Unknown";
    let priority = "None";
    let notes = "";

    for (const field of fields) {
      if ((field.key === "name" || field.key === "title") && field.text) title = field.text;
      if (field.key === "todo_assignee" && Array.isArray(field.user) && field.user.length > 0) assigneeId = field.user[0];
      if (field.key === "todo_due_date" && field.value) due = field.value;
      if (field.key === "Col093T8A25LG" && field.value) status = STATUS_OPTIONS[field.value] || status;
      if (field.key === "Col08V4T02P5Y" && field.value) priority = PRIORITY_OPTIONS_MAP[field.value] || priority;
      // Capture description from the specific column (Col08V5C24K1S)
      if (field.key === "Col08V5C24K1S" && field.text) {
        notes = field.text;
      }
    }

    const priorityMatch = title.match(/\b[Pp]([0-4])\b/);
    if (priorityMatch) {
      priority = "P" + priorityMatch[1];
      title = title.replace(/^\s*[Pp][0-4]\s*:?\s*/, "");
    }

    const teamId = "T06K7221F6C";
    const permalink = `https://ikhorlabs.slack.com/lists/${teamId}/${listId}?record_id=${raw.id}`;
    return { id: raw.id, title, assigneeId, due, status, priority, notes, permalink };
  }

  function filterRelevant(items) {
    // Include ToDo, In Progress, and In Review items for better context
    return items.filter((it) => 
      it.status === "ToDo" || 
      it.status === "In Progress" || 
      it.status === "In Review"
    );
  }

  function buildTasksContext(items, tz, maxItems = 80) {
    // Group items by status for better organization
    const byStatus = {
      "ToDo": [],
      "In Progress": [],
      "In Review": []
    };
    
    items.forEach(item => {
      if (byStatus[item.status]) {
        byStatus[item.status].push(item);
      }
    });
    
    // Sort each group by priority
    Object.keys(byStatus).forEach(status => {
      byStatus[status].sort((a, b) => 
        (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
      );
    });
    
    const sections = [];
    
    // Add ToDo items
    if (byStatus["ToDo"].length > 0) {
      sections.push("📝 ToDo Tasks:");
      byStatus["ToDo"].slice(0, 30).forEach(it => {
        sections.push(formatTaskLine(it, tz));
      });
    }
    
    // Add In Progress items
    if (byStatus["In Progress"].length > 0) {
      if (sections.length > 0) sections.push("");
      sections.push("🚀 In Progress:");
      byStatus["In Progress"].slice(0, 20).forEach(it => {
        sections.push(formatTaskLine(it, tz));
      });
    }
    
    // Add In Review items
    if (byStatus["In Review"].length > 0) {
      if (sections.length > 0) sections.push("");
      sections.push("👀 In Review:");
      byStatus["In Review"].slice(0, 20).forEach(it => {
        sections.push(formatTaskLine(it, tz));
      });
    }
    
    return sections.join("\n");
  }
  
  function formatTaskLine(item, tz) {
    const assignee = getUserName(item.assigneeId);
    const dueText = item.due ? dayjs(item.due).tz(tz).format("YYYY-MM-DD") : "no due date";
    const pri = item.priority && item.priority !== "None" ? `[${item.priority}]` : "";
    
    // Format notes/description
    let notes = "";
    if (item.notes) {
      const cleanNotes = item.notes.replace(/\s+/g, ' ').trim();
      if (cleanNotes.length > 150) {
        notes = ` — ${cleanNotes.slice(0, 150)}...`;
      } else if (cleanNotes) {
        notes = ` — ${cleanNotes}`;
      }
    }
    
    // Mark overdue items
    const isOverdue = item.due && dayjs(item.due).tz(tz).isBefore(dayjs().tz(tz), 'day');
    const overdueMarker = isOverdue ? "⚠️ " : "";
    
    return `- ${overdueMarker}${pri} ${assignee} • ${item.title} (${dueText})${notes}`;
  }

  router.post("/events", async (req, res) => {
    const body = req.slackRawBody ? JSON.parse(req.slackRawBody) : req.body;

    if (body.type === "url_verification") {
      return res.json({ challenge: body.challenge });
    }

    // Respond immediately to avoid retries
    res.status(200).send();

    if (body.type === "event_callback") {
      const event = body.event;
      if (event && event.type === "app_mention") {
        const { systemPrompt, googleModel, listId, timezone: tz } = getResearchConfig();
        const userText = stripMentions(event.text);
        const thread_ts = event.thread_ts || event.ts;

        // Simple commands
        if (/\bhelp\b/i.test(userText)) {
          try {
            await slack.chat.postMessage({ channel: event.channel, thread_ts, text: helpMessage });
          } catch (err) {
            console.error("Research help reply failed:", err);
          }
          return;
        }

        // Build comprehensive task context
        let tasksContext = "";
        try {
          const rawItems = await fetchListItems(slack, listId);
          const parsed = rawItems.map((r) => parseListItemForContext(r, listId));
          const relevant = filterRelevant(parsed);
          if (relevant.length > 0) {
            tasksContext = buildTasksContext(relevant, tz);
          }
        } catch (_) {}

        // Get user information
        const userId = event.user;
        const userName = USER_NAMES[userId] || `<@${userId}>`;
        
        // LLM reply
        const threadContext = await loadThreadSnippet(event.channel, thread_ts);
        let system = systemPrompt;
        system += `\n\nYou are responding to ${userName} who mentioned you in Slack.`;
        system += `\n\nTask Status Definitions:\n- ToDo: Task has not been started yet\n- In Progress: Task is currently being worked on\n- In Review: Task has been completed by the assignee and is awaiting review/approval from the requester\n`;
        if (tasksContext) {
          system += `\nCurrent R&D task status (organized by stage):\n${tasksContext}`;
        }
        if (threadContext) {
          system += `\n\nThread context (summarized, may be incomplete):\n${threadContext}`;
        }
        try {
          const content = await generateLLMReply({
            system,
            messages: [{ role: "user", content: userText || "Please introduce yourself and how you can help." }],
            model: googleModel,
          });
          await slack.chat.postMessage({ channel: event.channel, thread_ts, text: content });
          console.log(`Research bot LLM replied in ${event.channel}`);
        } catch (error) {
          console.error("Research LLM error:", error);
          try {
            await slack.chat.postMessage({ channel: event.channel, thread_ts, text: "⚠️ I hit an error talking to the LLM. Try again later." });
          } catch (_) {}
        }
      }
    }
  });

  return router;
}
