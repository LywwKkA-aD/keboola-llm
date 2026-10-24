# keboola-llm

A local web app for orchestrating AI agents that help a data analyst work with Keboola:
an orchestrator plus specialized agents (Keboola navigator, SQL engineer, job doctor, reviewers, docs),
shared memory, skills, and an "aquarium" where every agent is an animated octopus.

Status: the agent runtime and HTTP API work (terminal chat for now). The web UI and the aquarium are next.

## Requirements

| Tool | Why | Install |
|---|---|---|
| Node.js 24 LTS | runs the app | https://nodejs.org |
| OmniRoute | routes LLM calls to any provider | `npm i -g omniroute`, then `omniroute` |
| kbagent | Keboola CLI used by the Keboola agents | see below |

### kbagent

macOS / Linux:

```sh
curl -LsSf https://raw.githubusercontent.com/keboola/cli/main/install.sh | sh
```

Windows (PowerShell):

```powershell
winget install --id astral-sh.uv -e
$ver = (Invoke-RestMethod "https://api.github.com/repos/keboola/cli/releases/latest").tag_name.TrimStart('v')
uv tool install --force "keboola-cli[server] @ https://github.com/keboola/cli/releases/download/v$ver/keboola_cli-$ver-py3-none-any.whl"
uv tool update-shell
```

Then sign in (opens the browser): `kbagent auth login --stack https://connection.<your-stack>.keboola.com --register-projects`

### OmniRoute safety

Bind OmniRoute to loopback and require an API key, otherwise anyone on your network can spend your provider credits.
Add to `~/.omniroute/.env`:

```sh
OMNIROUTE_SERVER_HOST=127.0.0.1
REQUIRE_API_KEY=true
```

Create the key in the OmniRoute dashboard under Endpoints.

## Setup

```sh
npm install
npm start                   # app on http://127.0.0.1:4800
```

Open the app: until everything works, Home shows a setup checklist (also in Settings, Setup). It checks
that OmniRoute runs, takes your key and that the model answers, that kbagent is installed and has a Keboola
project, and that the team has a project to work on. Each failed step shows the command to run (PowerShell
on Windows) or a field to fill in. The OmniRoute key typed there is saved to `.env` and used at once, no
restart; it is never shown again. The Keboola token is typed into kbagent in your own terminal, never into
the app.

Without the UI: `cp .env.example .env`, fill in `OMNIROUTE_API_KEY`, `OMNIROUTE_MODEL` and `KEBOOLA_PROJECT`,
then:

```sh
npm run doctor              # the same checks as the setup checklist (sends one tiny request to the model)
npm run smoke:omniroute     # checks tool calling through OmniRoute
npm run chat                # or talk to the team in the terminal
```

`ENV_FILE=<path>` makes the app and doctor read (and the setup checklist write) another file than `.env`.

## Scripts

| Script | What it does |
|---|---|
| `npm run doctor` | Environment check: Node plus the setup checklist of the app |
| `npm run smoke:omniroute [-- <model>]` | Tool call, tool-result round trip and streamed tool call against OmniRoute |
| `npm run vendor:sync` | Re-copy Keboola's official agents/skills at the pinned commits |
| `npm run vendor:update` | Move the pins to the latest upstream commits, then sync |
| `npm run kbagent:snapshot` | Refresh the kbagent permission snapshot after upgrading kbagent |
| `npm start` / `npm run dev` | Run the API server (dev: restart on change) |
| `npm run chat [-- "message"]` | Terminal chat with the team (`--raw` dumps stream chunks, `--yes` auto-approves) |
| `npm test` / `npm run typecheck` | Unit tests / TypeScript check |
| `npm run test:e2e` | Build the web app, then Playwright tests of the real app against a stub LLM on port 4900 (no OmniRoute, no kbagent) |
| `npm run eval [-- --only id]` | Ask the running team the questions in `evals/shop.json` (real model and Keboola project, read-only) and grade the answers; report in `data/evals/` |

## Layout

```
agents/<name>/AGENT.md   one file per agent: role, skills, tools, Keboola access, avatar
skills/<name>/SKILL.md   the app's own skills (override vendored ones with the same name)
routines/<name>.md       scheduled routines: a cron schedule and the message for the lead (off until switched on in Settings)
server/                  Node.js API + agent runtime (deepagents / LangGraph via OmniRoute)
scripts/                 doctor, smoke test, vendor sync, kbagent snapshot
e2e/                     Playwright specs and the scripted OpenAI-compatible stub LLM they run against
evals/                   question sets with expected findings for `npm run eval` (shop.json targets fixtures/keboola-shop)
vendor/keboola/          Keboola's official agents and skills (generated, do not edit)
data/                    local state, not in git: chats, checkpoints, settings, and what the team knows:
  knowledge/             knowledge base, Markdown notes (agents see /knowledge/; edit them on the Knowledge page)
  memories/              shared memory AGENTS.md and project profiles in projects/ (agents see /memories/)
```

The knowledge base holds company notes, so it lives in `data/` (or `DATA_DIR`) and never in git. The first
start creates it with a README; notes an older version kept in the repo's `knowledge/` folder are copied over
once and the old folder can then be deleted.

## Safety model

- Agents reach Keboola only through `kbagent`. Every call is checked against kbagent's own permission
  catalog: read-only agents run with `--deny-writes`; destructive and admin operations are always blocked;
  credential, file-path and project-switching flags are rejected.
- Production is never written by agents: `kbagent_write` runs only with `--branch` pointing at a development branch
  (the production branch id is looked up and refused, so is `--branch 0`), `branch merge` is blocked, and
  keboola-developer ends a change with a merge request that the user merges in Keboola.
- Writes (Keboola changes, agent/skill files) wait for the user's approval in the UI. Pending approvals
  survive a server restart (`data/pending-approvals.json`, checked against the checkpoints on start).
  Listing or inspecting workspaces is a read and never asks; other SQL steps ask unless the chat allows SQL.
- A run that fails (model or OmniRoute error, step limit) or is stopped keeps its progress: Continue in the chat
  goes on from the last checkpoint. Chats a restart cut off midway are marked interrupted and only continue when
  the user says so. Model calls retry 429, 5xx and dropped connections with backoff; auth and validation errors fail at once.
- New or edited agents and skills (e.g. from agent-builder) join the team without a restart.
  Every change to `agents/*/AGENT.md` and `skills/*/SKILL.md`, whoever made it, is kept in `data/history`
  (last 50 versions per file); the Agents page shows the diff and restores an older version.
- Routines run only once the user switches them on (kept in `data/routines.json`, not in the repo file); each run
  is a new chat that stops at every approval like any other, and runs of one routine never overlap.
- The API listens on loopback only and rejects requests from other sites (Host/Origin check).

## Third-party content

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
