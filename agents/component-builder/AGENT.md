---
name: component-builder
description: "Builds and extends custom Keboola Python components (extractors, writers, applications): features, incremental loads, API clients, Ruff code quality. Disabled: needs a shell, file writes, uv, Docker and git, which this app does not give agents yet."
extends: vendor/keboola/ai-kit/plugins/component-developer/agents/component-builder.md
enabled: false
skills: [get-started, develop-component, component-defaults, keboola-context, debug-component, migrate-to-uv]
avatar: { color: "#8E44AD", prop: wrench }
---

Disabled in this app. This role writes and runs Python code for custom Keboola components. The upstream tools (Bash, Write, Edit, `ruff`, `uv`, WebFetch, Task) do not exist here, and the analyst's daily work is SQL transformations, not component development.

Enable it only after the app has a sandboxed code-execution tool and a workspace folder for the component repository. Then:
- New component: follow the `get-started` skill under `/skills/ai-kit-component-developer/` before writing any code. Ongoing work: `develop-component`. Templates: `component-defaults`.
- UI and schema work goes to `ui-developer`, tests to `tester` (both disabled for the same reason).
- Return file diffs and the commands you ran to the orchestrator, in English.
