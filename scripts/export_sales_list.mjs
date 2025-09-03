#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { WebClient } from "@slack/web-api";
import { getSalesConfig } from "../bots/sales/config.mjs";

dotenv.config();

async function main() {
  const { token, listId } = getSalesConfig();
  if (!token || !listId) {
    console.error("Missing SALES_BOT_TOKEN or SALES_LIST_ID in env");
    process.exit(1);
  }
  const slack = new WebClient(token);

  // Ensure output dir
  const outDir = path.join(process.cwd(), "data");
  fs.mkdirSync(outDir, { recursive: true });

  // Fetch schema
  try {
    const schemaResp = await slack.apiCall("slackLists.get", { list_id: listId });
    fs.writeFileSync(path.join(outDir, "sales_list_schema.json"), JSON.stringify(schemaResp, null, 2));
    console.log("Saved:", path.join(outDir, "sales_list_schema.json"));
  } catch (e) {
    console.warn("Failed to fetch schema:", e?.data?.error || e.message);
  }

  // Fetch items
  const itemsResp = await slack.apiCall("slackLists.items.list", { list_id: listId, limit: 500 });
  if (!itemsResp.ok) {
    console.error("Failed to fetch list items:", itemsResp.error);
    process.exit(1);
  }
  const items = itemsResp.items || [];
  fs.writeFileSync(path.join(outDir, "sales_list_raw.json"), JSON.stringify(items, null, 2));
  console.log("Saved:", path.join(outDir, "sales_list_raw.json"));

  // Write a long-form CSV of all fields for mapping
  const csvPath = path.join(outDir, "sales_list_fields.csv");
  const header = ["item_id", "field_key", "text", "value", "user", "select"];
  const lines = [header.join(",")];
  for (const it of items) {
    const fields = it.fields || [];
    for (const f of fields) {
      const row = [
        JSON.stringify(it.id ?? ""),
        JSON.stringify(f.key ?? ""),
        JSON.stringify(f.text ?? ""),
        JSON.stringify(f.value ?? ""),
        JSON.stringify(Array.isArray(f.user) ? f.user.join(";") : (f.user ?? "")),
        JSON.stringify(f.select ? JSON.stringify(f.select) : ""),
      ];
      lines.push(row.join(","));
    }
  }
  fs.writeFileSync(csvPath, lines.join("\n"));
  console.log("Saved:", csvPath);
}

main().catch((e) => {
  console.error("Export failed:", e);
  process.exit(1);
});

