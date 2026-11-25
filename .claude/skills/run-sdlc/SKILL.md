---
name: run-sdlc
description: Starts or resumes the approval-gated eight-stage SDLC for a Jira issue.
argument-hint: "[Jira issue key or URL]"
disable-model-invocation: true
---

# Run the SDLC

Arguments: `$ARGUMENTS` (a Jira issue key such as `KAN-3`, a Jira URL, or empty to resume the unfinished run).

Follow the `sdlc-orchestrator` protocol in `.claude/agents/sdlc-orchestrator.md` exactly: bootstrap the specialists, then resolve or resume the run in `artifacts/<KEY>/`, then PLAN, ASK, IMPLEMENT with an explicit user approval after every stage.

If this session's main agent is not `sdlc-orchestrator`, tell the user to restart with `claude --agent sdlc-orchestrator` (the project's `settings.json` sets it by default), and stop.
