**Multi-Bot Structure**
This repo supports multiple Slack bots in the same workspace. Each bot has its own config, daily update script, and mention handler, while sharing small utilities.

**Layout**
- `bots/research/`: Research bot implementation
- `  config.mjs`: Reads env vars, key assignees, and static user map
- `  daily_update.mjs`: Posts the daily digest (Lists → Slack message)
- `  events.mjs`: Responds to app_mention with bot-specific help
- `bots/sales/`: Sales bot implementation
- `  config.mjs`, `daily_update.mjs`, `events.mjs` (analogous to Research)
- `src/server.mjs`: Single Express server, mounts one route per bot
- `src/lib/`: Shared helpers
- `  slack.mjs`: createClient(token) factory
- `  time.mjs`: dayjs with utc/timezone configured

Legacy files kept for compatibility:
- `research_chan_daily_update.mjs`: thin wrapper calling `bots/research/daily_update.mjs`
- `bot_server.mjs`: superseded by `src/server.mjs` (unused by default)

**Routes**
- Research: POST /slack/research/events
- Sales: POST /slack/sales/events
Each route verifies its own signing secret and uses its own bot token. Configure each Slack App’s Event Subscriptions Request URL to point to its route. Both apps can live in the same workspace and see the same users.

**Environment Variables**
Per-bot envs (new names only):
- Research
  - `RESEARCH_BOT_TOKEN`
  - `RESEARCH_SIGNING_SECRET`
  - `RESEARCH_CHANNEL_ID`
  - `RESEARCH_LIST_ID`
  - `RESEARCH_TIMEZONE` (fallback to `TIMEZONE`)
  - `RESEARCH_KEY_ASSIGNEES` (optional, comma-separated emails)
- Sales
  - `SALES_BOT_TOKEN`
  - `SALES_SIGNING_SECRET`
  - `SALES_CHANNEL_ID`
  - `SALES_LIST_ID`
  - `SALES_TIMEZONE` (fallback to `TIMEZONE`)
  - `SALES_KEY_ASSIGNEES` (optional, comma-separated emails)
Notes:
- Use real bot tokens (xoxb-...) for posting. App tokens (xapp-...) will not work for chat.postMessage.

**Scripts**
- npm start: node src/server.mjs (mentions server)
- npm run daily-update: Research daily digest
- npm run bot:research:update: Research daily digest
- npm run bot:sales:update: Sales daily digest
- npm run dev: watch server

**GitHub Actions**
- Research workflow: .github/workflows/daily-update.yml
- Sales workflow: .github/workflows/sales-daily-update.yml
Set corresponding repo secrets for tokens, channels, and list IDs using the new names (e.g., `RESEARCH_BOT_TOKEN`, `SALES_BOT_TOKEN`).

**Contributing / Adding a New Bot**
1. Copy one of the bot folders (e.g., bots/research → bots/<newbot>)
2. Update config.mjs to read <NEWBOT>_* env vars (and set fallbacks if needed)
3. Edit daily_update.mjs:
   - Change header text and any bot-specific logic
   - Adjust key assignees or mappings if needed
4. Create events.mjs with a tailored help message
5. Mount the route in src/server.mjs (verify signing secret and create a Slack client with the bot token)
6. Add npm run bot:<newbot>:update script to package.json
7. Add a GitHub Action to schedule the daily update if desired

**Future: Knowledge/Canvas Queries**
- Add an optional capabilities.mjs per bot exporting handlers (e.g., handleCanvasQuery({ text, user })).
- Route unknown app_mention commands in events.mjs to capabilities, which can call MCP or an LLM. This keeps the daily update and event plumbing unchanged.

**Guidelines**
- Keep shared code tiny (token/client/time only). Put list-specific mappings in each bot.
- Prefer explicit per-bot envs; keep fallbacks to maintain backward compatibility.
- Avoid duplicating complex helpers until patterns stabilize; extract later if duplication grows.

**LLM Chat (Mentions)**
- Research and Sales bots support LLM replies on app_mention using Google Gemini only.
- Configure in `.env`:
  - `GOOGLE_API_KEY` (Google AI Studio API key)
  - `GOOGLE_MODEL` (default: `gemini-1.5-pro`)
  - Optional: `LLM_MAX_TOKENS`, `LLM_TEMPERATURE`
  - Persona: `RESEARCH_SYSTEM_PROMPT` (override default)
- Thread context: the bot tries to read recent thread messages to provide context to the LLM; if scopes are missing, it still answers using the current message.
- Code: `src/lib/llm.mjs` (Gemini wrapper), `bots/research/events.mjs` and `bots/sales/events.mjs` (routing), `bots/research/config.mjs`/`bots/sales/config.mjs` (persona/envs).
