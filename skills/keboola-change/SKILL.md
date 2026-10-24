---
name: keboola-change
description: Make an agreed change to a Keboola project safely - a development branch, the edit (SQL transformation, config, flow), a run on the branch, verification against production, then a promotion to production the user approves in the app. Use for fixing, optimizing or extending transformations and pipelines.
---

# Changing a Keboola project

Production is never edited directly. Every change happens on a development branch, every write waits for the user's
approval, and the result reaches production only through `kbagent_promote`, which the user approves in the app after
seeing production next to the branch. The tools enforce this; the steps below make the change worth promoting.

## 1. Understand before touching anything

- Read the project profile (`/memories/projects/<file>.md`) and the notes of the affected transformation under
  `/knowledge/data-model/<project-file>/` if they exist.
- Fetch the current production code: `kbagent_read ["transformation", "show", "--config-id", K]` (ids renumber after
  edits; show again before every edit), or `["config", "detail", "--component-id", C, "--config-id", K]` for other
  components. Note the production `version` of every configuration you will change (from `config detail`): the
  promotion in step 7 needs it and refuses if production moved on in the meantime.
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

## 7. Production

For every configuration you changed, call `kbagent_promote` with its component id, config id, your branch id, the
production `version` from step 1 and a one-line summary for the configuration history. The user sees production
next to the branch in the app and approves or rejects; the app copies the branch configuration itself. If it answers
that production changed, read production again, redo the change on the branch if needed, and promote again. If it
refuses because configuration rows changed, tell the user to merge that one in Keboola.

Only when the user asks for a review in Keboola and the project has merge requests (`branches-merge-requests`), open
one instead: `["merge-request", "create", "--branch", B, "--title", "...", "--description", "..."]` (see
`references/merge-request-workflow.md`). Never approve or merge it yourself.

## Report

Branch name and id, the change (a short diff of the SQL), the branch job id and status, the verification numbers,
and the promotion result (the new production version, or why it was refused or rejected). The branch can be deleted in
Keboola afterwards. If you stopped early, say where and why.
