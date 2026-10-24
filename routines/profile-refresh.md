---
name: profile-refresh
title: Profile refresh
description: Weekly refresh of the Keboola project profile by project-scout, so the team starts every task with a current map of the project.
schedule: "0 7 * * 1"
enabled: false
---

Weekly refresh of the Keboola project profile. Read-only in Keboola.

First read the current profile in /memories/projects/, if there is one, so you can compare. Then have project-scout
survey the project again following its project-survey skill: it overwrites the profile in /memories/projects/ and
updates the project's entry under `## Projects` in /memories/AGENTS.md.

Then tell me in up to five lines what changed since the previous profile (buckets, tables, transformations, flows
and schedules added or removed; job health), or that nothing changed.
