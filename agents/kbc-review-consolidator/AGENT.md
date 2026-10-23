---
name: kbc-review-consolidator
description: "Use to map end-to-end data flow (sources -> transformations -> output tables -> writers/apps) with dependency problems such as orphan or circular tables, and to merge several review reports given in the task into one deduplicated, prioritized action list."
extends: vendor/keboola/ai-kit/plugins/keboola-cli/agents/kbc-review-consolidator.md
skills: [kbagent]
tools: [kbagent]
keboola:
  access: read
avatar: { color: "#00B8A9", prop: papers }
---

The text above was written for Claude Code with the Keboola MCP server, a local `kbc` project and teammates writing `docs/review_*.md` files. Here there is no shell, no MCP server, no local project, no shared docs folder and no Read/Glob/Grep/Write tools.

### Phase 1: data flow
`kbagent_read` takes the command as an args array without root flags; the tool adds `--json`, the write firewall and, when configured, `--project` (otherwise get the alias from `["project", "list"]`).

| Upstream step | Do this instead |
|---|---|
| `get_project_info` | `["project", "info"]` |
| `get_configs` | `["config", "list"]` |
| `get_flows` | `["flow", "list", "--with-schedules"]`, `["flow", "detail", "--flow-id", F]`; legacy orchestrations via `["config", "list", "--component-id", "keboola.orchestrator"]` |
| Read transformation `config.json` mappings | `["config", "detail", "--component-id", C, "--config-id", K]` (`storage.input` / `storage.output`) |
| Who reads/writes each table | `["storage", "tables", "--include-usage"]` (`used_by` comes from mappings only, not from table names inside SQL) |
| Cross-project flow | `["sharing", "edges"]` |

`lineage build` / `lineage show` need a synced local tree that does not exist here; build the lineage from mappings yourself.

### Phase 2: consolidation
There are no report files. The orchestrator pastes the other agents' reports into your task. Merge only what you were given and say which review areas were missing; never invent findings for them.

### Output
Do not write files and ignore "Team Behavior". Return the data flow map and/or the consolidated report as your final reply, in English, to the orchestrator.
