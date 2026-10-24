---
name: project-survey
description: Survey a Keboola project read-only with kbagent and write its profile for the team - backend, branches, storage layers, transformations and lineage, flows and schedules, job health, conventions. Use on first contact with a project or when asked to refresh the profile.
---

# Project survey

Goal: one compact profile that lets every agent start a task already knowing what the project is made of. It is a
map, not an audit: record what exists and how it connects, flag what looks broken, and leave deep analysis to the
specialists.

## Rules

- Metadata only. Use `kbagent_read`; never `kbagent_sql`, never run jobs, never touch data. The survey costs API
  calls, not Keboola credits.
- Stay cheap: about 15 calls for a small project, at most 40 for a large one. Prefer the list commands below over
  per-object detail calls; skip `context`, job logs and `--include-rows`.
- Never copy secrets or parameters: no tokens, passwords, `#encrypted` values, connection strings, emails or row data.
- If a command fails, note it under "Gaps" and go on; check exact flags with
  `grep -n "<command>" /skills/cli-kbagent/kbagent/references/commands-reference.md`.

## Calls (args arrays for `kbagent_read`)

1. `["version"]` once.
2. `["project", "info"]`: id, name, stack, backend (Snowflake or BigQuery). Its storage statistics can be stale.
3. `["branch", "list"]`: default branch and development branches.
4. `["storage", "buckets"]`, then `["storage", "tables", "--include-usage"]`: tables per bucket with rows, size,
   last import, and `used_by` (configurations that read or write the table through mappings).
5. `["config", "list"]`: every configuration with its component; group them into extractors, transformations,
   writers, applications, flows.
6. `["flow", "list", "--with-schedules"]` and `["schedule", "list"]`: what runs on its own and when.
7. `["job", "list", "--limit", "100"]` and `["job", "list", "--status", "error", "--limit", "20"]`: health.
8. `["workspace", "list"]`: existing SQL workspaces (agents reuse `agent-*` ones).
9. Only when steps 4-5 leave a transformation's inputs or outputs unclear: `["config", "detail", "--component-id",
   C, "--config-id", K]` for at most 10 transformations. Read `["transformation", "show", "--config-id", K]` for 2-3
   representative ones to note SQL dialect and naming style.

## Working out the layers

Keboola projects usually move data raw -> cleaned (lake, staging) -> modelled (DWH, marts). Assign each bucket a
role from its stage (`in`/`out`), its name and the transformation edges between buckets (`used_by` plus outputs).
State how sure you are when the naming is not obvious.

## The profile

Write `/memories/projects/<file>.md`, where `<file>` is the project alias with every character other than letters,
digits, `-` and `_` replaced by `-`. Overwrite the previous version. English, at most 150 lines:

```markdown
# Keboola project <alias>

Surveyed <YYYY-MM-DD> by project-scout from metadata (read-only). Ask project-scout to refresh it.

## Basics
Project id, name, stack URL, backend and SQL dialect, default branch, development branches.

## Data layers
| Layer | Buckets | Tables | Notes |
One row per layer; then the largest or most used tables (id, rows, size, last import).

## Pipelines
Each transformation: name, config id, component, inputs -> outputs (bucket-level is fine for big projects).
Flows: name, id, phases or tasks in order, schedule (cron, timezone, enabled).

## Sources and destinations
Extractors, writers and applications with their component ids.

## Health
Jobs in the last 100: succeeded / failed / other. Recent failures: config, job id, date, one-line error.
Configurations with no runs and tables never imported.

## Conventions
Naming patterns (buckets, tables, columns, configs), folders, SQL style seen in the sampled transformations.

## Gaps
What could not be read or decided, and questions worth asking the analyst.
```

## Shared memory

Then keep `/memories/AGENTS.md` pointing at the profile: under a `## Projects` heading, one entry of 2-4 lines per
project - backend, size in buckets and tables, the layer flow in one line, pipeline count, and
`Profile: /memories/projects/<file>.md (<date>)`. Replace older lines about the same project that the profile now
supersedes; leave every other entry as it is.

## Report

Return to the lead: the profile path, five lines of highlights (backend, layers, pipelines, schedules, health) and
anything that looks broken or risky.
