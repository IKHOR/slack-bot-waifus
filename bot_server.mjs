#!/usr/bin/env node

import { WebClient } from "@slack/web-api";
import express from "express";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const token = process.env.BOT_TOKEN_RESEARCH_CHAN || process.env.SLACK_BOT_TOKEN;
const signingSecret = process.env.SLACK_SIGNING_SECRET;
const slack = new WebClient(token);

// Raw body needed for signature verification
app.use(express.raw({ type: "application/json" }));

// Verify Slack request signature
function verifySlackSignature(req) {
  const signature = req.headers["x-slack-signature"];
  const timestamp = req.headers["x-slack-request-timestamp"];
  const body = req.body.toString("utf-8");

  // Prevent replay attacks
  const time = Math.floor(new Date().getTime() / 1000);
  if (Math.abs(time - timestamp) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(sigBasestring)
    .digest("hex")}`;

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}

// Help message for @mentions
const helpMessage = `Hi! I'm Research Chan 💚🧪✨ 

I provide daily priority updates for the R&D team. Here's what I do:

📋 **Daily Updates** (9 AM JST automatically):
• 💢 Overdue P0-P3 items requiring immediate attention
• ⏰ Items due in the next 2 days  
• ✅ Top priorities for key team members

🎯 **What I track**:
• Only ToDo and In Progress items
• Priority levels P0-P3
• Due dates and assignees

💡 **Tips**:
• I post updates every morning at 9 AM JST
• I only track items from the R&D Slack List
• Complete, Deprecated, and Backlog items are excluded

_For manual updates, ask your admin to run the bot._`;

// Handle Slack events
app.post("/slack/events", async (req, res) => {
  // Verify request is from Slack
  if (signingSecret && !verifySlackSignature(req)) {
    return res.status(401).send("Unauthorized");
  }

  const body = JSON.parse(req.body);

  // Handle URL verification challenge
  if (body.type === "url_verification") {
    return res.json({ challenge: body.challenge });
  }

  // Respond with 200 immediately to avoid Slack retries
  res.status(200).send();

  // Handle event callbacks
  if (body.type === "event_callback") {
    const event = body.event;

    // Handle app mentions
    if (event.type === "app_mention") {
      try {
        await slack.chat.postMessage({
          channel: event.channel,
          thread_ts: event.thread_ts || event.ts, // Reply in thread if mentioned in thread
          text: helpMessage
        });
        console.log(`Responded to mention in ${event.channel}`);
      } catch (error) {
        console.error("Error responding to mention:", error);
      }
    }
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Research Chan Bot is running! 💚🧪✨");
});

// Start server
app.listen(port, () => {
  console.log(`Research Chan bot server listening on port ${port}`);
  console.log("Ready to respond to @mentions!");
});