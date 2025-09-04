#!/usr/bin/env node

import { createClient } from "../src/lib/slack.mjs";
import { getResearchConfig } from "../bots/research/config.mjs";
import fs from "fs";

// Status and priority mappings from daily_update.mjs
const STATUS_OPTIONS = {
  "Opt2AUH34OG": "ToDo",
  "Opt62NHHN5C": "ToDo",
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

async function exportList() {
  const { token, listId } = getResearchConfig();
  
  if (!token || !listId) {
    console.error("Missing RESEARCH_BOT_TOKEN or RESEARCH_LIST_ID");
    process.exit(1);
  }

  const slack = createClient(token);
  
  console.log("Fetching Research list items...");
  const response = await slack.apiCall("slackLists.items.list", {
    list_id: listId,
    limit: 500
  });

  if (!response.ok) {
    console.error("Failed to fetch list:", response.error);
    process.exit(1);
  }

  const items = response.items || [];
  console.log(`Found ${items.length} items`);

  // Parse items into structured data
  const parsedItems = items.map(item => {
    const fields = item.fields || [];
    
    let data = {
      id: item.id,
      title: "Untitled",
      assignee_id: "",
      assignee_name: "",
      due_date: "",
      status_option_id: "",
      status_mapped: "Unknown",
      status_raw: "",
      priority_option_id: "",
      priority_mapped: "None",
      priority_raw: "",
      description: "",
      completed: false,
      created_by: item.created_by,
      date_created: new Date(item.date_created * 1000).toISOString(),
      updated_timestamp: item.updated_timestamp
    };

    // Track all field keys for debugging
    const allFields = {};

    fields.forEach(field => {
      allFields[field.key] = {
        value: field.value,
        text: field.text,
        user: field.user,
        select: field.select,
        checkbox: field.checkbox
      };

      // Title
      if (field.key === "name" || field.key === "title") {
        data.title = field.text || "";
      }

      // Assignee
      if (field.key === "todo_assignee" && field.user && field.user.length > 0) {
        data.assignee_id = field.user[0];
      }

      // Due date
      if (field.key === "todo_due_date" && field.value) {
        data.due_date = field.value;
      }

      // Status (Col093T8A25LG)
      if (field.key === "Col093T8A25LG") {
        data.status_option_id = field.value || "";
        data.status_raw = field.text || "";
        data.status_mapped = STATUS_OPTIONS[field.value] || `UNMAPPED(${field.value})`;
        
        // Log unmapped statuses
        if (!STATUS_OPTIONS[field.value] && field.value) {
          console.log(`Unmapped status: ${field.value} = "${field.text || 'no text'}"`);
        }
      }

      // Priority (Col08V4T02P5Y)
      if (field.key === "Col08V4T02P5Y") {
        data.priority_option_id = field.value || "";
        data.priority_raw = field.text || "";
        data.priority_mapped = PRIORITY_OPTIONS_MAP[field.value] || `UNMAPPED(${field.value})`;
        
        // Log unmapped priorities
        if (!PRIORITY_OPTIONS_MAP[field.value] && field.value) {
          console.log(`Unmapped priority: ${field.value} = "${field.text || 'no text'}"`);
        }
      }

      // Description (Col08V5C24K1S)
      if (field.key === "Col08V5C24K1S" && field.text) {
        data.description = field.text.replace(/\n/g, " ").slice(0, 500);
      }

      // Completed checkbox
      if (field.key === "todo_completed") {
        data.completed = field.value === true;
      }
    });

    // Also store all fields as JSON for deep debugging
    data.all_fields_json = JSON.stringify(allFields);

    return data;
  });

  // Find items with "Test Qwen" in title for debugging
  const testQwenItems = parsedItems.filter(item => 
    item.title.toLowerCase().includes("test qwen")
  );
  
  if (testQwenItems.length > 0) {
    console.log("\n=== Test Qwen Items Found ===");
    testQwenItems.forEach(item => {
      console.log(`Title: ${item.title}`);
      console.log(`Status: ${item.status_mapped} (ID: ${item.status_option_id})`);
      console.log(`Priority: ${item.priority_mapped}`);
      console.log(`Due: ${item.due_date}`);
      console.log("---");
    });
  }

  // Generate CSV manually
  try {
    const fields = [
      'id', 'title', 'assignee_id', 'due_date', 
      'status_option_id', 'status_mapped', 'status_raw',
      'priority_option_id', 'priority_mapped', 'priority_raw',
      'description', 'completed', 'created_by', 'date_created', 
      'updated_timestamp'
    ];
    
    // Create CSV header
    const csvRows = [fields.join(',')];
    
    // Add data rows
    parsedItems.forEach(item => {
      const row = fields.map(field => {
        let value = item[field] || '';
        // Escape values containing commas, quotes, or newlines
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(row.join(','));
    });
    
    const csv = csvRows.join('\n');
    
    // Write CSV file
    const filename = 'research_list_export.csv';
    fs.writeFileSync(filename, csv);
    console.log(`\nExported to ${filename}`);
    
    // Also write a JSON file for easier analysis
    const jsonFilename = 'research_list_export.json';
    fs.writeFileSync(jsonFilename, JSON.stringify(parsedItems, null, 2));
    console.log(`Also exported to ${jsonFilename}`);

    // Summary statistics
    const statusCounts = {};
    const priorityCounts = {};
    
    parsedItems.forEach(item => {
      statusCounts[item.status_mapped] = (statusCounts[item.status_mapped] || 0) + 1;
      priorityCounts[item.priority_mapped] = (priorityCounts[item.priority_mapped] || 0) + 1;
    });

    console.log("\n=== Status Distribution ===");
    Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
      console.log(`${status}: ${count}`);
    });

    console.log("\n=== Priority Distribution ===");
    Object.entries(priorityCounts).sort((a, b) => b[1] - a[1]).forEach(([priority, count]) => {
      console.log(`${priority}: ${count}`);
    });

    // Find all unique unmapped status IDs
    const unmappedStatuses = new Set();
    parsedItems.forEach(item => {
      if (item.status_mapped.startsWith("UNMAPPED") && item.status_option_id) {
        unmappedStatuses.add(item.status_option_id);
      }
    });

    if (unmappedStatuses.size > 0) {
      console.log("\n=== UNMAPPED STATUS IDs ===");
      console.log("Add these to STATUS_OPTIONS in daily_update.mjs:");
      unmappedStatuses.forEach(id => {
        const example = parsedItems.find(item => item.status_option_id === id);
        console.log(`  "${id}": "${example.status_raw || 'Unknown'}",`);
      });
    }

  } catch (err) {
    console.error("Error generating CSV:", err);
    process.exit(1);
  }
}

exportList().catch(console.error);