---
name: morning-check
title: Morning check
description: Weekday morning health check of the Keboola project - failed jobs and flows since the previous working day, stale tables and anything odd. Read-only, no SQL.
schedule: "0 8 * * 1-5"
enabled: false
---

Morning health check of the Keboola project. Read-only: project metadata through kbagent only. No SQL, no
workspaces, no job runs, no changes.

Have keboola-expert look at everything since the start of the previous working day (Friday when today is Monday).
Use the project profile in /memories/projects/ to know what normally runs and when.

1. Failed jobs: jobs that ended in error, warning or were terminated. For each one the configuration (component
   and config id), job id, time and a one-line error from the job detail.
2. Flows: scheduled flows that failed, ran much longer than usual, or did not run although their schedule says
   they should have.
3. Stale tables: tables whose last import is clearly older than their producer's schedule, and tables the profile
   lists as regularly loaded that were not touched.
4. Anything odd: jobs running for hours, the same configuration failing repeatedly, an unusual number of jobs.

Report briefly: a one-line verdict first (all good, or needs attention), then one bullet per finding with its ids
(job, configuration, flow, table) and the next step you suggest. If everything is fine, say so in one line.
