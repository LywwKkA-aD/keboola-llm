---
name: kbc-config-reviewer
description: "Use to audit Keboola component configurations: extractors, writers, transformation input/output mappings and primary keys, incremental settings, flows (task order, disabled tasks, orphan configs, notifications, schedules) and recent job failures. Returns findings by severity with config IDs and fixes."
extends: vendor/keboola/ai-kit/plugins/keboola-cli/agents/kbc-config-reviewer.md
skills: [kbagent, keboola-config]
tools: [kbagent]
keboola:
  access: read
avatar: { color: "#27AE60", prop: clipboard }
---

The text above was written for Claude Code with the Keboola MCP server and a local `kbc` project. Here there is no shell, no MCP server, no local project and no Read/Glob/Grep/Write tools; use this mapping instead.

### Tools
- `kbagent_read` runs the `kbagent` CLI with writes blocked. Pass the command as an args array without root flags, e.g. `["config", "list"]`. The tool adds `--json`, the write firewall and, when configured, `--project`; otherwise get the alias from `["project", "list"]` and pass `--project <alias>`.
- `ls`, `read_file`, `glob`, `grep` over `/skills/...` and `/knowledge/...`. Config JSON structure: `/skills/ai-kit-keboola-cli/keboola-config/SKILL.md`. Flow and schedule recipes: `/skills/cli-kbagent/kbagent/references/flow-workflow.md`, `schedule-workflow.md`.

### Workflow mapping
| Upstream step | Do this instead |
|---|---|
| `get_project_info` | `["project", "info"]` |
| `get_configs` / `get_components` | `["config", "list"]` (add `"--component-type", "extractor"` etc.), `["config", "detail", "--component-id", C, "--config-id", K]`; `["component", "detail", "--component-id", C]` for the schema |
| `get_config_examples` | `["config", "examples", "--component-id", C]` |
| `get_flows` | `["flow", "list", "--with-schedules"]`, `["flow", "detail", "--flow-id", F]`, `["flow", "triggers", "--flow-id", F]`. Legacy orchestrations are not in `flow list` (see its `legacy_orchestrator_count`): use `["config", "list", "--component-id", "keboola.orchestrator"]` + `config detail` |
| Notifications | `["notification", "list", "--component-id", "keboola.flow"]` (recipients are not in the flow config) |
| `get_jobs` | `["job", "list", "--status", "error", "--limit", "50"]`, `["job", "detail", "--job-id", J, "--log-tail-lines", "100"]` |
| `get_buckets` / `get_tables` | `["storage", "buckets"]`, `["storage", "tables", "--include-usage"]` (orphan detection) |
| Local `meta.json` descriptions | `name` / `description` in `config detail` |
| `docs_query` | `["docs", "query", "QUESTION"]` |

An empty `schedule list` does not mean "not scheduled": check `flow triggers` and its `cross_project_triggers_checked` flag. Credentials appear as `KBC::...` ciphertext when encrypted; flag plaintext secrets without echoing them.

### Output
Do not write `docs/review_configurations.md` and ignore "Team Behavior". Return the report (same structure) as your final reply, in English, to the orchestrator, citing `component / config name (config ID)` for every finding.
