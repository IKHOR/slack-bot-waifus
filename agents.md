# Agents Overview

A quick, practical deep dive into the two Slack agents in this repo: Research Chan and Sales Chan — how they work, what they depend on, and how to run or extend them.

## Architecture

- Research + Sales bots run behind a single Express server with distinct routes.
- @mention replies are powered by a minimal Gemini wrapper.
- Daily digests are posted via separate scripts per bot.

### Processes
- Server: `node src/server.mjs` exposes Slack Events endpoints and returns quick 200s.
- Daily jobs: `bots/*/daily_update.mjs` post formatted digests to channels.

## Entry Points

- Server: `src/server.mjs`
  - Mounts routes:
    - Research events: `POST /slack/research/events`
    - Sales events: `POST /slack/sales/events`
  - Verifies Slack signatures using raw body and HMAC.
  - Health check: `GET /` returns a simple message.

- Research daily update: `bots/research/daily_update.mjs`
- Sales daily update: `bots/sales/daily_update.mjs`
- Legacy single‑bot server (kept for back‑compat): `bot_server.mjs`

## Event Flow (@mentions)

- Router creation: `bots/research/events.mjs` and `bots/sales/events.mjs` export `create…EventsRouter`.
- Signature verification: middleware in `src/server.mjs` parses raw body and validates headers.
- Event handling:
  - If `type=url_verification` → echo `challenge`.
  - If `event.type=app_mention` →
    - Recognize `help` to print a short capability message.
    - Otherwise generate an LLM reply with persona‑specific system prompt.

File references:
- Signature verifier: `src/server.mjs:17`
- Research router: `bots/research/events.mjs:1`
- Sales router: `bots/sales/events.mjs:1`
- Health route: `src/server.mjs:47`

## LLM Layer (Gemini)

- Minimal wrapper for Google AI Studio (Generative Language API).
- Env‑driven with sane defaults and basic error propagation.

File references:
- Wrapper: `src/lib/llm.mjs:1`
- Entry: `generateLLMReply({ system, messages, model, … })` `src/lib/llm.mjs:10`

Environment:
- `GOOGLE_API_KEY` (required)
- `GOOGLE_MODEL` or per‑bot overrides (`RESEARCH_GOOGLE_MODEL`, `SALES_GOOGLE_MODEL`)
- Optional tuning: `LLM_MAX_TOKENS`, `LLM_TEMPERATURE`

Behavior:
- Translates chat messages to Gemini `contents` roles.
- Supports a `systemInstruction` string.
- Returns plain text from the top candidate.

## Slack Integration

- Client factory: `src/lib/slack.mjs` returns a WebClient; fails fast on missing token.
- Event routers use Web API methods like `chat.postMessage` and `conversations.replies`.
- Slack Lists data pulled via `apiCall("slackLists.items.list", …)` for context/digests.

File references:
- Client: `src/lib/slack.mjs:1`
- Research list fetch: `bots/research/events.mjs:35`
- Sales thread context: `bots/sales/events.mjs:12`

## Research Chan

Purpose:
- Post a daily digest for R&D and answer @mentions with context‑aware replies.

Config: `bots/research/config.mjs`
- `RESEARCH_BOT_TOKEN`, `RESEARCH_SIGNING_SECRET`, `RESEARCH_CHANNEL_ID`, `RESEARCH_LIST_ID`
- `TIMEZONE` (default `Asia/Tokyo`)
- Key assignees (emails) and a fallback email→Slack ID map
- Persona: `RESEARCH_SYSTEM_PROMPT` and optional `RESEARCH_GOOGLE_MODEL`

Event replies: `bots/research/events.mjs`
- Loads recent thread snippet for grounding.
- Fetches Slack List items (if `RESEARCH_LIST_ID` set), parses and filters to `ToDo`, `In Progress`, `In Review`.
- Builds a staged task context and appends it to the system prompt before LLM call.

List parsing highlights:
- Status options: maps `Col093T8A25LG` to names like `ToDo`, `In Review`, `In Progress`.
- Priority options: maps `Col08V4T02P5Y` to `P0–P3`.
- Captures description from `Col08V5C24K1S`.

File references:
- Research config: `bots/research/config.mjs:1`
- Status map: `bots/research/events.mjs:46`
- Priority map: `bots/research/events.mjs:54`
- Context builder: `bots/research/events.mjs:119`
- LLM call: `bots/research/events.mjs:247`

Daily digest: `bots/research/daily_update.mjs`
- Pulls list, parses items, resolves user IDs, and posts a structured digest:
  - Overdue items (🔴/🟠 by priority) with mentions
  - Items due today/tomorrow
  - Top priority per key assignee
  - Prompt ping to a specific owner for the day’s focus
- Prints a preview to the console before posting

File references:
- Priority map: `bots/research/daily_update.mjs:12`
- Status map: `bots/research/daily_update.mjs:19`
- Digest blocks: `bots/research/daily_update.mjs:178`
- Runner: `bots/research/daily_update.mjs:235`

## Sales Chan

Purpose:
- Post a daily digest for Sales and answer @mentions with a concise, action‑oriented tone.

Config: `bots/sales/config.mjs`
- `SALES_BOT_TOKEN`, `SALES_SIGNING_SECRET`, `SALES_CHANNEL_ID`, `SALES_LIST_ID`
- `SALES_TIMEZONE` (falls back to `TIMEZONE`), `SALES_DM_RECIPIENTS` (emails)
- Persona: `SALES_SYSTEM_PROMPT` and optional `SALES_GOOGLE_MODEL`

Event replies: `bots/sales/events.mjs`
- Similar to Research but lighter context: includes recent thread snippet with persona system prompt.

Daily digest: `bots/sales/daily_update.mjs`
- Sales‑specific field maps for status and priority
- Filters to `Not started`/`In progress` with `P0–P3`
- Renders overdue and next‑2‑days sections, then posts to channel

File references:
- Sales config: `bots/sales/config.mjs:1`
- Sales status map: `bots/sales/daily_update.mjs:12`
- Sales priority map: `bots/sales/daily_update.mjs:20`
- Digest blocks: `bots/sales/daily_update.mjs:101`
- LLM call: `bots/sales/events.mjs:60`

Note:
- `SALES_DM_RECIPIENTS` is captured in config but not yet used in the posting logic.

## Environment Variables

See `.env.example` for the full list. Core variables by area:

Slack (per bot):
- Research: `RESEARCH_BOT_TOKEN`, `RESEARCH_SIGNING_SECRET`, `RESEARCH_CHANNEL_ID`, `RESEARCH_LIST_ID`
- Sales: `SALES_BOT_TOKEN`, `SALES_SIGNING_SECRET`, `SALES_CHANNEL_ID`, `SALES_LIST_ID`
- Shared: `TIMEZONE`

LLM:
- `GOOGLE_API_KEY`, `GOOGLE_MODEL`, `LLM_MAX_TOKENS`, `LLM_TEMPERATURE`
- Persona overrides: `RESEARCH_SYSTEM_PROMPT`, `RESEARCH_GOOGLE_MODEL`, `SALES_SYSTEM_PROMPT`, `SALES_GOOGLE_MODEL`

## Running Locally

- Install deps: `npm install`
- Start server for @mentions: `npm start`
- Run research digest once: `npm run bot:research:update`
- Run sales digest once: `npm run bot:sales:update`
- Dev server with watch: `npm run dev`

Slack app settings (per bot):
- Events Request URL:
  - Research: `https://<host>/slack/research/events`
  - Sales: `https://<host>/slack/sales/events`
- Bot scopes: `app_mentions:read`, `chat:write`, `lists:read`, `users:read`

## Field Mapping Notes (Slack Lists)

Research lists:
- Status (`Col093T8A25LG`) → ToDo/In Review/In Progress/Deprecated/Backlog/Complete
- Priority (`Col08V4T02P5Y`) → P0/P1/P2/P3
- Description (`Col08V5C24K1S`) captured into notes

Sales lists:
- Status and priority use workspace‑specific option IDs; see maps in `bots/sales/daily_update.mjs`.

Tip: Use `scripts/export_research_list.mjs` to analyze and validate mappings with real data, then keep constants in sync across scripts.

## Security

- Signature verification uses Slack’s `v0` HMAC (timestamp + raw body) and rejects stale requests.

File references:
- Verifier implementation: `src/server.mjs:17`

## Known Gaps / Follow‑ups

- Mapping drift:
  - `scripts/export_research_list.mjs` still maps `Opt62NHHN5C` to `ToDo`, whereas `bots/research/*` treat it as `In Review`. Align these.
- Missing script:
  - `package.json` references `scripts/export_sales_list.mjs`, but it’s not present; add or remove the script.
- Sales DMs:
  - `SALES_DM_RECIPIENTS` is parsed but not yet used; implement optional DM fan‑out if desired.
- Tests:
  - No test harness is present; consider adding light smoke tests for field parsing and route wiring.

## Repository Map

- Server and libs: `src/`
- Bot logic (config, events, daily updates): `bots/research/*`, `bots/sales/*`
- Scripts and tooling: `scripts/*`, `deploy.sh`, `Procfile`

---
If you want, I can wire up a simple cron/scheduler (Heroku Scheduler or GitHub Actions) to run the daily updates automatically, or add a small test to assert field parsing stays in sync.
