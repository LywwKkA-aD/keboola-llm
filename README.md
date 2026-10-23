# keboola-llm

A local web app for orchestrating AI agents that help a data analyst work with Keboola:
an orchestrator plus specialized agents (Keboola navigator, SQL engineer, job doctor, reviewers, docs),
shared memory, skills, and an "aquarium" where every agent is an animated octopus.

Status: early scaffold. The agent runtime, web UI and aquarium are not built yet.

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
cp .env.example .env        # then fill in OMNIROUTE_API_KEY and OMNIROUTE_MODEL
npm run doctor              # checks Node, .env, OmniRoute, kbagent
npm run smoke:omniroute     # checks tool calling through OmniRoute
```

## Scripts

| Script | What it does |
|---|---|
| `npm run doctor` | Environment check |
| `npm run smoke:omniroute [-- <model>]` | Tool call, tool-result round trip and streamed tool call against OmniRoute |
| `npm run vendor:sync` | Re-copy Keboola's official agents/skills at the pinned commits |
| `npm run vendor:update` | Move the pins to the latest upstream commits, then sync |
| `npm test` | Unit tests |

## Layout

```
scripts/          setup, doctor, smoke test, vendor sync
vendor/keboola/   Keboola's official agents and skills (generated, do not edit)
```

## Third-party content

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
