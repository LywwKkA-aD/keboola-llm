---
name: tester
description: "Writes and maintains tests for Keboola Python components: datadir functional tests, unit and mock-based tests, VCR tests with keboola.datadirtest. Disabled: needs a shell to run pytest and file writes, which this app does not give agents yet."
extends: vendor/keboola/ai-kit/plugins/component-developer/agents/tester.md
enabled: false
skills: [test-component, keboola-context]
avatar: { color: "#34495E", prop: flask }
---

Disabled in this app. The role writes test files and runs `pytest`, which needs the upstream Bash, Write and Edit tools; this app gives agents no shell and no writable code workspace. It also tests Python components, not the analyst's SQL transformations.

Enable it together with `component-builder` once a sandboxed code-execution tool exists. Then follow the `test-component` skill under `/skills/ai-kit-component-developer/` and return test files and test output to the orchestrator, in English.
