#!/usr/bin/env node

import express from "express";
import crypto from "crypto";
import dotenv from "dotenv";
import { createClient } from "./lib/slack.mjs";
import { getResearchConfig } from "../bots/research/config.mjs";
import { getSalesConfig } from "../bots/sales/config.mjs";
import { createResearchEventsRouter } from "../bots/research/events.mjs";
import { createSalesEventsRouter } from "../bots/sales/events.mjs";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Signature verification middleware factory (keeps raw body)
function slackSignatureVerifier(signingSecret) {
  return (req, res, next) => {
    const secret = signingSecret;
    // Capture raw body for signature verification and downstream parsing
    let data = Buffer.alloc(0);
    req.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
    });
    req.on("end", () => {
      req.slackRawBody = data.toString("utf-8");
      if (!secret) return next();
      const signature = req.headers["x-slack-signature"];
      const timestamp = req.headers["x-slack-request-timestamp"]; 
      if (!signature || !timestamp) return res.status(401).send("Unauthorized");
      const time = Math.floor(new Date().getTime() / 1000);
      if (Math.abs(time - parseInt(timestamp, 10)) > 300) return res.status(401).send("Expired");
      const sigBasestring = `v0:${timestamp}:${req.slackRawBody}`;
      const mySignature = `v0=${crypto.createHmac("sha256", secret).update(sigBasestring).digest("hex")}`;
      try {
        const ok = crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
        if (!ok) return res.status(401).send("Unauthorized");
      } catch {
        return res.status(401).send("Unauthorized");
      }
      next();
    });
  };
}

// Health endpoint
app.get("/", (req, res) => {
  res.send("Multi-bot server is running");
});

// Research bot route
const research = getResearchConfig();
if (research.token) {
  const researchSlack = createClient(research.token);
  const researchHelp = "Hi! I'm Research Chan :green_heart::test_tube::sparkles:: I provide daily priority updates for the R&D team.";
  app.use("/slack/research", slackSignatureVerifier(research.signingSecret), createResearchEventsRouter({ slack: researchSlack, helpMessage: researchHelp }));
  console.log("Mounted Research bot at /slack/research");
} else {
  console.warn("Research bot token not set; skipping /slack/research route");
}

// Sales bot route
const sales = getSalesConfig();
if (sales.token) {
  const salesSlack = createClient(sales.token);
  const salesHelp = "Hi! I'm Sales Chan :large_blue_circle::briefcase:: I post sales priorities and respond to mentions.";
  app.use("/slack/sales", slackSignatureVerifier(sales.signingSecret), createSalesEventsRouter({ slack: salesSlack, helpMessage: salesHelp }));
  console.log("Mounted Sales bot at /slack/sales");
} else {
  console.warn("Sales bot token not set; skipping /slack/sales route");
}

// TEMPORARY: Legacy route for backward compatibility
// Remove this once Slack Event Subscriptions are updated
if (research.token) {
  const researchSlack = createClient(research.token);
  const researchHelp = "Hi! I'm Research Chan :green_heart::test_tube::sparkles:: I provide daily priority updates for the R&D team.";
  app.use("/slack/events", slackSignatureVerifier(research.signingSecret), createResearchEventsRouter({ slack: researchSlack, helpMessage: researchHelp }));
  console.log("TEMPORARY: Also mounted Research bot at /slack/events for backward compatibility");
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

