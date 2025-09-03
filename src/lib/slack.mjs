import { WebClient } from "@slack/web-api";

export function createClient(token) {
  if (!token) {
    throw new Error("Missing Slack bot token");
  }
  return new WebClient(token);
}

