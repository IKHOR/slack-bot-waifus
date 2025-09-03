import express from "express";
import { generateLLMReply } from "../../src/lib/llm.mjs";
import { getSalesConfig } from "./config.mjs";

export function createSalesEventsRouter({ slack, helpMessage }) {
  const router = express.Router();

  function stripMentions(text) {
    return (text || "").replace(/<@[^>]+>/g, "").replace(/\s+/g, " ").trim();
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

  router.post("/events", async (req, res) => {
    const body = req.slackRawBody ? JSON.parse(req.slackRawBody) : req.body;

    if (body.type === "url_verification") {
      return res.json({ challenge: body.challenge });
    }

    res.status(200).send();

    if (body.type === "event_callback") {
      const event = body.event;
      if (event && event.type === "app_mention") {
        const { systemPrompt, googleModel } = getSalesConfig();
        const userText = stripMentions(event.text);
        const thread_ts = event.thread_ts || event.ts;

        if (/\bhelp\b/i.test(userText)) {
          try {
            await slack.chat.postMessage({ channel: event.channel, thread_ts, text: helpMessage });
          } catch (err) {
            console.error("Sales help reply failed:", err);
          }
          return;
        }

        const context = await loadThreadSnippet(event.channel, thread_ts);
        const system = context
          ? `${systemPrompt}\n\nThread context (summarized, may be incomplete):\n${context}`
          : systemPrompt;
        try {
          const content = await generateLLMReply({
            system,
            messages: [{ role: "user", content: userText || "Please introduce yourself and how you can help with sales tasks." }],
            model: googleModel,
          });
          await slack.chat.postMessage({ channel: event.channel, thread_ts, text: content });
          console.log(`Sales bot LLM replied in ${event.channel}`);
        } catch (error) {
          console.error("Sales LLM error:", error);
          try {
            await slack.chat.postMessage({ channel: event.channel, thread_ts, text: "⚠️ I hit an error talking to the LLM. Try again later." });
          } catch (_) {}
        }
      }
    }
  });

  return router;
}
