# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- 2026-11-25: Browser Todo app with persistent tasks (KAN-3, https://adarsh0628.atlassian.net/browse/KAN-3). Plain HTML, CSS and JavaScript with no build step and no runtime dependencies; open `index.html` directly from disk or from any static server.
  - Add a task (text is trimmed; blank input is rejected with a visible message), toggle it complete or incomplete (check mark plus strikethrough, not colour alone), and delete it.
  - Tasks are saved in the browser's `localStorage` (key `todoApp.tasks`, versioned envelope) and restored on reload in the same order. Missing, corrupt or unavailable storage falls back to an empty list without a page error.
  - Task text is rendered as plain text, never as HTML.
  - Responsive layout for 320, 375, 768 and 1280 px widths with 44 px minimum touch targets and keyboard operation.
  - Dev-only Node built-in test suite (`node --test`, 249 tests); nothing is installed.
- SDLC run records for KAN-3 under `artifacts/KAN-3/` (requirements, architecture, design review, implementation plan, code review, verification report, state and log).
- Approval-gated SDLC framework: the `sdlc-orchestrator` and eight specialist agents under `.claude/agents/`, state and approval hooks under `.claude/hooks/` (`guard-delivery.mjs`, `check-state.mjs`, `sdlc-cli.mjs`, `sdlc-lib.mjs`), the `run-sdlc` skill, `.claude/settings.json`, an Atlassian MCP server entry in `.mcp.json`, and project instructions in `CLAUDE.md`.

### Changed

- Framework hooks: `.claude/hooks/check-stage-status.mjs` is replaced by `check-state.mjs`, `guard-delivery.mjs`, `sdlc-cli.mjs` and `sdlc-lib.mjs`.
