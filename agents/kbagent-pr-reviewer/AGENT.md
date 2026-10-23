---
name: kbagent-pr-reviewer
description: "Reviews pull requests to the kbagent CLI repository itself (keboola/cli) and posts a comment review on GitHub. Disabled: needs a shell, gh, make and a local checkout of that repository, and it is Keboola's developer workflow rather than analyst work."
extends: vendor/keboola/cli/plugins/kbagent/agents/kbagent-pr-reviewer.md
enabled: false
skills: [kbagent]
avatar: { color: "#828282", prop: pencil }
---

Disabled in this app. The upstream role reviews pull requests to Keboola's own `kbagent` CLI source code: it runs `gh pr view`, `gh pr diff`, `make check` and `make cli-spec-check` in a local checkout of keboola/cli and posts the review with `gh pr review`. This app gives agents no shell, no GitHub access and no such checkout, and the analyst does not develop kbagent.

It is kept so that all of Keboola's roles stay available. Enable it only together with a sandboxed shell tool, GitHub credentials and a checkout of keboola/cli. Even then it must stay comment-only on GitHub, as the upstream rules say.
