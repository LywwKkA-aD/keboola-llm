---
name: keboola-change
description: Make an agreed change to a Keboola project safely - a development branch, the edit (SQL transformation, config, flow), a run on the branch, verification against production and a merge request the user merges. Use for fixing, optimizing or extending transformations and pipelines.
---

# Changing a Keboola project

Production is never written. Every change happens on a development branch, every write waits for the user's
approval, and the result reaches production only when the user merges your merge request in Keboola. The tools
enforce this; the steps below make the change worth merging.

## 1. Understand before touching anything

- Read the project profile (`/memories/projects/<file>.md`) and the notes of the affected transformation under
  `/knowledge/data-model/<project-file>/` if they exist.
- Fetch the current production code: `kbagent_read ["transformation", "show", "--config-id", K]` (ids renumber after
  edits; show again before every edit), or `["config", "detail", "--component-id", C, "--config-id", K]` for other
  components.
- Restate the change in one paragraph: what, where (config ids, block/code ids), why, expected effect on the data.
  If the brief does not match what you see, stop and report instead of guessing.

## 2. Preview on production inputs (cheap, no branch yet)

For SQL changes, prove the new logic before writing it: reuse a workspace (`kbagent_sql ["workspace", "list"]`, an
`agent-*` one), load the production inputs you need, and run the new SELECT next to the current output's numbers
(row counts, key uniqueness, sums of the metrics you touch, a few sample keys). Use the project's dialect
(BigQuery or Snowflake, see the profile). This is the main evidence in the merge request.

## 3. Branch

`kbagent_write ["branch", "create", "--name", "agent/<short-topic>", "--description", "<one line>"]`. One branch per
task; reuse it for follow-ups on the same task. Note its id: every later write passes `"--branch", "<id>"`.

## 4. Edit

- SQL transformations: `["transformation", "edit", "--config-id", K, "--change-description", "...", "--op", "<json>",
  "--branch", B, "--dry-run"]` first, then the same without `--dry-run`. Prefer `str_replace` ops for small fixes and
  `set_code` for rewrites. Check `references/commands-reference.md` (grep "transformation edit") for the op format;
  `--storage` replaces all mappings, so include every mapping you keep.
- Other configs: `["config", "update", ..., "--branch", B]` with `--dry-run` first where supported.
- Change only what the brief covers. Keep the project's naming and SQL conventions
  (`/knowledge/conventions/<project-file>.md`).

## 5. Run on the branch

`["job", "run", "--component-id", C, "--config-id", K, "--branch", B, "--wait", "--log-tail-lines", "50"]`.
Runs cost Keboola credits: one run per meaningful version, not per tweak. On failure read the log tail, fix, run again
(at most three attempts, then report).

## 6. Verify

- The job succeeded on the branch; compare `["storage", "table-detail", "--table-id", T, "--branch", B]` with
  production (rows, columns, primary key).
- The numbers from step 2 hold: say exactly which checks passed and which could not be run.

## 7. Merge request

`["merge-request", "create", "--branch", B, "--title", "<imperative summary>", "--description", "<markdown>"]` with:
what changed and why, the before/after numbers, the job id on the branch, risks and what the user should look at.
See `references/merge-request-workflow.md` in the kbagent skill. Never approve or merge it yourself.

## Report

Branch name and id, the change (a short diff of the SQL), the branch job id and status, the verification numbers,
the merge request id and title, and how to discard the change (delete the branch in Keboola). If you stopped early,
say where and why.
