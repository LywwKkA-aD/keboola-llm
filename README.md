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
cp .env.example .env        # then fill in OMNIROUTE_API_KEY, OMNIROUTE_MODEL, KEBOOLA_PROJECT
npm run doctor              # checks Node, .env, OmniRoute, kbagent
npm run smoke:omniroute     # checks tool calling through OmniRoute
npm start                   # API on http://127.0.0.1:4800
npm run chat                # or talk to the team in the terminal
```

## Scripts

| Script | What it does |
|---|---|
| `npm run doctor` | Environment check |
| `npm run smoke:omniroute [-- <model>]` | Tool call, tool-result round trip and streamed tool call against OmniRoute |
| `npm run vendor:sync` | Re-copy Keboola's official agents/skills at the pinned commits |
| `npm run vendor:update` | Move the pins to the latest upstream commits, then sync |
| `npm run kbagent:snapshot` | Refresh the kbagent permission snapshot after upgrading kbagent |
| `npm start` / `npm run dev` | Run the API server (dev: restart on change) |
| `npm run chat [-- "message"]` | Terminal chat with the team (`--raw` dumps stream chunks, `--yes` auto-approves) |
| `npm test` / `npm run typecheck` | Unit tests / TypeScript check |

## Layout

```
agents/<name>/AGENT.md   one file per agent: role, skills, tools, Keboola access, avatar
skills/<name>/SKILL.md   the app's own skills (override vendored ones with the same name)
knowledge/               shared knowledge base (Markdown)
server/                  Node.js API + agent runtime (deepagents / LangGraph via OmniRoute)
scripts/                 doctor, smoke test, vendor sync, kbagent snapshot
vendor/keboola/          Keboola's official agents and skills (generated, do not edit)
data/                    local state, not in git: chats, checkpoints, shared memory, settings
```

## Safety model

- Agents reach Keboola only through `kbagent`. Every call is checked against kbagent's own permission
  catalog: read-only agents run with `--deny-writes`; destructive and admin operations are always blocked;
  credential, file-path and project-switching flags are rejected.
- Writes (Keboola changes, agent/skill files) wait for the user's approval in the UI. Pending approvals
  survive a server restart (`data/pending-approvals.json`, checked against the checkpoints on start).
  Listing or inspecting workspaces is a read and never asks; other SQL steps ask unless the chat allows SQL.
- New or edited agents and skills (e.g. from agent-builder) join the team without a restart.
- The API listens on loopback only and rejects requests from other sites (Host/Origin check).

## Third-party content

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
