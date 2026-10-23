---
name: ui-developer
description: "Designs configuration schemas and UI for custom Keboola components (configSchema.json, conditional fields, sync actions) and tests them with the schema tester and Playwright. Disabled: needs a shell and file writes, which this app does not give agents yet."
extends: vendor/keboola/ai-kit/plugins/component-developer/agents/ui-developer.md
enabled: false
skills: [build-component-ui, keboola-context]
avatar: { color: "#795548", prop: laptop }
---

Disabled in this app. The role edits `configSchema.json` / `configRowSchema.json` and launches the schema tester and Playwright, which needs the upstream Bash, Write and Edit tools; this app gives agents no shell and no writable code workspace. It belongs to custom component development, not to the analyst's SQL work.

Enable it together with `component-builder` once a sandboxed code-execution tool exists. Then follow the `build-component-ui` skill under `/skills/ai-kit-component-developer/` and return schema diffs to the orchestrator, in English.
