# keboola-llm

Agent Studio: a local web app where a team of AI agents helps a data analyst work with Keboola. A lead takes the
request and hands it to specialists (Keboola expert, configuration analyst, project scout, reviewers for SQL,
performance, data quality, DWH design, security and more, a developer that changes things on a development branch,
a knowledge keeper and an agent builder). The team shares memory, a knowledge base and skills; Home shows it at work
in a 3D data-centre hall.

**Analyst's step-by-step guide (Windows, in Russian): [docs/quickstart.ru.md](docs/quickstart.ru.md).**

What it does:

- Chat with the team, with `/` commands (`/skill`, `/agent`, `/plan`, `/init`, `/sql`, `/new`, `/help`); every step
  of a run opens to what it did (command, SQL, diff, task).
- Init workspace: project-scout maps the project and documents its production transformations in the knowledge base.
- Changes only on a development branch, every write approved in the app; a verified change reaches production
  through an in-app promotion the analyst approves after seeing the diff (or merge requests / the Keboola UI,
  depending on her role and the project's features, which the app reads).
- Knowledge base and shared memory pages, agent version history with rollback, scheduled routines, token usage with
  the prompt-cache share, a setup checklist that needs no file editing.

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

Windows (PowerShell, no admin rights needed; Keboola's own block from https://github.com/keboola/cli#install with
uv's installer instead of winget, runs in one paste; the setup checklist offers the same block):

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
$ver = (Invoke-RestMethod "https://pypi.org/pypi/keboola-cli/json").info.version
uv tool install --force "keboola-cli[server] @ https://github.com/keboola/cli/releases/download/v$ver/keboola_cli-$ver-py3-none-any.whl"
if ($LASTEXITCODE -ne 0 -and $ver) { uv tool install --force "keboola-cli[server]==$ver" }
if ($LASTEXITCODE -ne 0) { uv tool install --force "keboola-cli[server]" }
uv tool update-shell
```

Without Python or uv: unpack `keboola-cli2_<version>_windows_amd64.zip` from https://github.com/keboola/cli/releases
(a single `kbagent.exe`) into a folder on your PATH.

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
| `npm run eval:routing [-- --only id]` | Check whom the lead hands each request in `evals/routing.json` to; stops each run at the first hand-off, approves nothing |
| `npm run check:first-start` | Start the built app like a fresh install (no `.env`, empty data folder) and check the UI, setup checklist and team (CI runs it on Windows and Linux) |

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
data/                    local state, never in git: chats, checkpoints, settings, usage, version history, and what the team knows:
  knowledge/             knowledge base, Markdown notes (agents see /knowledge/; edit them on the Knowledge page)
  memories/              shared memory AGENTS.md and project profiles in projects/ (agents see /memories/)
docs/                    the analyst's quick start
```

Back up `data/` (with the app stopped) to keep the team's knowledge. Agents, skills and routines that agent-builder
creates or edits are written to `agents/`, `skills/` and `routines/` in the working copy; the app never runs git.

The knowledge base holds company notes, so it lives in `data/` (or `DATA_DIR`) and never in git. The first
start creates it with a README; notes an older version kept in the repo's `knowledge/` folder are copied over
once and the old folder can then be deleted.

## Safety model

- Agents reach Keboola only through `kbagent`. Every call is checked against kbagent's own permission
  catalog: read-only agents run with `--deny-writes`; destructive and admin operations are always blocked;
  credential, file-path and project-switching flags are rejected.
- Production is never edited by agents: `kbagent_write` runs only with `--branch` pointing at a development branch
  (the production branch id is looked up and refused, so is `--branch 0`) and `branch merge` is blocked. A verified
  change reaches production only through `kbagent_promote`: the user sees production next to the branch in the app
  and approves; the app then copies the branch configuration itself (no content from the agent) and refuses if
  production changed since the agent read it. This works without Keboola's merge-request feature.
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
