---
name: workspace-init
description: Document how a Keboola project's production data model is built - per table purpose, grain, keys, columns and how each is derived, lineage and conventions - from transformation code and table metadata, into the team knowledge base. Use for "init workspace" after the project profile exists, one batch of transformations per call.
---

# Init workspace: documenting production

The profile (`/memories/projects/<file>.md`, from the `project-survey` skill) is the map. This skill reads production
itself, the code and the table metadata, and writes down how the data is built, so nobody has to rediscover it.

## Rules

- Production only, read-only: no `--branch`, `kbagent_read` only. No SQL on data, no jobs. Code and metadata are
  enough to say what a table means; say "not verified on data" where it matters.
- You get one batch: a list of transformation config ids (and their component ids) from the lead. Document exactly
  those and the tables they write. Other agents document other batches at the same time, so write only the files
  named below for your batch and never edit shared notes (glossary, index, conventions): put candidates for them in
  your report instead.
- Never copy secrets, parameters, `#encrypted` values or row data into notes.

## Calls per transformation

1. `["transformation", "show", "--config-id", K, "--component-id", C]`: the SQL blocks and the storage mappings.
2. For each output table: `["storage", "table-detail", "--table-id", T]`: columns, types, primary key, rows,
   descriptions already set in Keboola.
3. Input tables that no batch owns (sources, manual uploads): one `table-detail` each, only if the code needs it to
   be understood.

## One note per transformation

Write `/knowledge/data-model/<project-file>/<config-slug>.md`, where `<project-file>` follows the profile's file
rule and `<config-slug>` is the configuration name in lowercase with every run of characters other than letters and
digits replaced by `-`. Overwrite it if it exists. English. Layout:

```markdown
# <Transformation name>

Config `<config id>` (`<component id>`), layer <raw -> lake | lake -> DWH | ...>. Documented <YYYY-MM-DD> from
production code by project-scout.

## Purpose
Two or three sentences: what business question the output answers.

## Inputs
| Table | Used as | Notes |

## Outputs
### <table id>
- Grain: one row per <...>. Primary key: <...>. Rows: <n> (<date>).
- Built from: <inputs and joins in one line>.

| Column | Type | Meaning and derivation |
One row per column. Derivation in plain words plus the expression when it is not obvious
(e.g. `revenue = items_amount + shipping_fee`, `email = lower(trim(email))`).

## Logic worth knowing
Filters, deduplication, incremental behaviour, time zones, currency, magic values, hard-coded lists.

## Risks
Possible bugs or fragile spots seen in the code (fan-outs, NULL handling, implicit casts), marked "not verified on
data".
```

## Report to the lead

The note paths you wrote, then candidates for the shared notes:

- Glossary: business terms with a one-line definition and the column that carries them.
- Conventions: naming and SQL patterns you saw.
- Lineage edges: `<input table> -> <transformation> -> <output table>`.
- Risks worth adding to the profile's known issues.

## Final step (one agent, after all batches)

When the lead asks for the wrap-up, write the shared notes from the batch reports:

- `/knowledge/data-model/<project-file>/README.md`: layers, the lineage edges (as an indented list per layer) and
  a table of contents linking every transformation note.
- `/knowledge/glossary.md`: merge the terms in alphabetically; keep existing entries and add the project name to
  ones that are project-specific.
- `/knowledge/conventions/<project-file>.md`: naming, SQL style and modelling patterns.
- In the profile, add a `## Documentation` section: date, which transformations are documented (n of total) and
  where the notes are. Add new known issues under Health.
