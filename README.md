# Research Chan - Daily Update

A focused Slack bot that delivers daily priority updates for key team members, tracking P0/P1 items and urgent deadlines. Also responds to @mentions with helpful instructions.

### Sections
- 🚨 **OVERDUE items/ Due soon** - bold, all-caps alerts for past-due P0/P1 items
- ⏰ **Top Daily Priority** - highlights items due in next 2 days with countdown
- 📅 **Smart date tracking** - "Due today", "Due tomorrow", or days remaining

## Daily Update Script

The `research_chan_daily_update.mjs` script provides a focused daily digest that:

1. **Alerts on overdue items** with bold, caps formatting - if they exist
2. **Warns about upcoming deadlines** (items due in next 2 days) - if they exist
3. **Shows top priority per assignee** for key team member
4. **Provides direct links** to each task in Slack Lists

### Message Format

```
💚🧪✨ Research Chan - Daily Update ✨🧪💚

// if there are overdue items, if not, don't include this section
💢 OVERDUE ITEMS REQUIRING IMMEDIATE ATTENTION 💢
• ❤️ @user [Task Name with link] | [priority]

// if there are soon due items (due today or tomorrow), if not, don't include this section
⏰ Items Due Soon (Next 2 Days) 
• 🧡 @user [Task Name with link] | [priority]
• 🧡 @user [Task Name with link] | [priority]

📋 Top Priorities for the Day
// these are always @kytra, @ryo, and @joao - it should pull from a object that we can update for the users / accounts to call
@kytra: 
✅ Top Priority: [Task Name with link] | [priority]

@ryo:
✅ Top Priority: [Task Name with link] | [priority]

@joao:
No items left To Do
// this is an example message, it should be the top priority if there are any priorities

@kytra -chan ~ what is the big focus for today? 😘
// this should always @kytra as she gives a daily goal
```

```
📞💓♠️ Sales Chan - Daily Update ♠️💓📞

// if there are overdue items, if not, don't include this section
💢 OVERDUE ITEMS REQUIRING IMMEDIATE ATTENTION 💢
• ❤️ @user [Task Name with link] | [priority]

// if there are soon due items (due today or tomorrow), if not, don't include this section
⏰ Items Due Soon (Next 2 Days) 
• 🧡 @user [Task Name with link] | [priority]
• 🧡 @user [Task Name with link] | [priority]
```


## Field Mapping Guide for Slack Lists Integration

When setting up new bots that integrate with Slack Lists, you'll need to correctly identify and map field IDs. Slack Lists uses encoded column IDs (e.g., `Col08V4T02P5Y`) and option IDs (e.g., `Opt0183CXDH`) that need to be discovered through data analysis.

### How to Find Correct Field Mappings

#### 1. **Export Raw Data**
First, fetch the raw list data from Slack:
```javascript
const response = await slack.apiCall("slackLists.items.list", {
  list_id: listId,
  limit: 200
});
fs.writeFileSync('debug-list-full.json', JSON.stringify(response.items, null, 2));
```

#### 2. **Identify Priority Field**
Priority is typically a dropdown field with option IDs:

```javascript
// Create find-priority-field.mjs
// Cross-reference known priorities with field values
const knownPriorities = {
  "Task Name 1": "P0",
  "Task Name 2": "P1",
  // Add 50+ known items for accuracy
};

// Analyze which field has consistent mappings
// Look for a field where each option ID maps to only one priority
```

**Key Learning**: The priority field (`Col08V4T02P5Y` in our case) has consistent 1:1 mapping:
- `Opt0183CXDH` → P0
- `Opt4GBWBKZB` → P1  
- `OptGESIX7LE` → P2
- `Opt24AKKH4V` → P3

**Status Field Discovery**: The status field (`Col093T8A25LG`) maps to these values:
- `Opt2AUH34OG` → ToDo
- `Opt62NHHN5C` → ToDo
- `OptHSJVP60E` → In Progress
- `OptHX1KN4IP` → In Progress
- `OptZHYHCA4A` → In Progress
- `Opt38B8RWRR` → Mixed (default to In Progress)

#### 3. **Distinguish Assignee vs Requester Fields**
Slack Lists may have multiple user fields:

```javascript
// Check for standard field keys first
if (field.key === "todo_assignee") {
  // This is the assignee
} else if (field.key === "Col08UWN5NX6F") {
  // This might be requester/creator
}
```

**Key Learning**: Always check for semantic field keys (`todo_assignee`, `todo_completed`) before using encoded column IDs.

#### 4. **Map Status/Bucket Fields**
Status fields can be complex with inconsistent mappings:

```javascript
// Status field may not have clean 1:1 mapping
// Check for todo_completed override
if (field.key === "todo_completed" && field.value === true) {
  status = "Complete";
} else if (field.key === "Col093T8A25LG") {
  // Status dropdown - may need fallback logic
  status = STATUS_OPTIONS[field.value] || "In Progress";
}
```

**Key Learning**: Status fields often don't map cleanly. Use `todo_completed` for definitive Complete status, and implement fallback logic.

### Analysis Scripts for Field Discovery

#### find-priority-field.mjs
```javascript
// Analyzes field consistency by cross-referencing 50+ known items
// Identifies which field has reliable priority mappings
```

#### check-assignee-fields.mjs  
```javascript
// Compares todo_assignee vs other user fields
// Verifies correct user is being referenced
```

#### find-status-field.mjs
```javascript
// Maps status dropdown options to ToDo/In Progress/Complete
// Identifies inconsistencies in status mappings
```

### Best Practices

1. **Always verify with large datasets** - Use 50+ known items to validate mappings
2. **Check for semantic field keys first** - `todo_assignee`, `todo_completed`, `todo_due_date`
3. **Handle inconsistent mappings gracefully** - Implement fallback logic for ambiguous fields
4. **Test thoroughly** - Run test scripts to verify correct user mentions and field parsing
5. **Document field mappings** - Keep a record of discovered column IDs and option mappings

### Common Field Types in Slack Lists

- **Text fields**: `field.text` contains the value
- **User fields**: `field.user` array contains user IDs
- **Date fields**: `field.value` contains timestamp
- **Checkbox fields**: `field.value` is boolean
- **Dropdown/Select fields**: `field.value` contains option ID, `field.select` contains available options

## Features

### Interactive Bot (@mentions)
The bot responds when mentioned in any channel it's in:
- `@research_chan` - Shows help message with bot capabilities
- Responds in thread if mentioned in a thread
- Provides instructions on what the bot tracks and when it runs

## Setup

### Prerequisites

1. Slack workspace with Lists feature (paid plan)
2. Heroku account and CLI installed  
3. Node.js 22.x
4. Slack app with Event Subscriptions enabled

### Slack App Configuration

1. **Event Subscriptions**:
   - Enable Event Subscriptions in your Slack app
   - Set Request URL: `https://your-app.herokuapp.com/slack/events`
   - Subscribe to bot event: `app_mention`

2. **OAuth Scopes** (Bot Token Scopes):
   - `app_mentions:read` - Read messages that mention the bot
   - `chat:write` - Send messages
   - `lists:read` - Read Slack Lists
   - `users:read` - Read user information

3. **Install App** to your workspace

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```env
RESEARCH_BOT_TOKEN=xoxb-your-bot-token
RESEARCH_SIGNING_SECRET=your-signing-secret
RESEARCH_CHANNEL_ID=C0123456789
RESEARCH_LIST_ID=F0123456789
TIMEZONE=Asia/Tokyo
PORT=3000
```

3. Run the bot:
```bash
npm run daily-update  # Run daily digest once
npm start            # Start server for @mentions
npm run dev          # Start with auto-reload
```
