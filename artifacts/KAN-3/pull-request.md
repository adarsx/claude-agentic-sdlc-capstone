# KAN-3 Pull Request Draft

- **Proposed PR title:** KAN-3: Browser Todo app with persistent tasks
- **Repository:** `adarsx/claude-agentic-sdlc-capstone`
- **Head branch:** `feature`
- **Base branch:** `main`
- **Jira:** https://adarsh0628.atlassian.net/browse/KAN-3 (link only; requirements were taken from the approved `artifacts/KAN-3/requirements.md`)
- **Status:** Final draft. The PR is left open for the user to review and merge; the workflow never merges.
- **Commit shape:** a single new commit on top of GitHub `main` (`b48d2c1`, "Initial commit", which contains only a 30-byte `README.md`). The earlier local commits (`11d6962`, `a2bb750`) are not part of the PR history; their content is squashed into that one commit. Remote `main` is untouched and nothing is force-pushed. Because `main` holds only a README, every other file in this PR shows as an addition.

## Summary

This change adds a small browser Todo app written in plain HTML, CSS and JavaScript with no build step and no runtime dependencies. Users can add, complete and delete tasks, and the list survives a page reload through `localStorage`. The logic lives in a DOM-free module that is unit-tested with Node's built-in test runner (dev-only), and the full SDLC run record for KAN-3 is included. The PR also carries the approval-gated SDLC framework (orchestrator and specialist agents, state and approval hooks, the `run-sdlc` skill, MCP config and project instructions) that produced this work.

## Changes Made

Application files (new, repository root):

- `index.html`: page structure. A labelled add form, an always-present `role="alert"` message element, an empty-state message, the task list, a `<noscript>` notice, and two classic deferred scripts (`todo-logic.js` then `app.js`). No inline script, no external requests, a `data:` favicon so no `favicon.ico` request is made.
- `styles.css`: mobile-first layout. Flex layout that wraps long text, 44 px minimum sizes for input, Add, task checkbox and Delete, a `[hidden]` rule, a full-row checkbox hit area, check mark plus line-through for completed tasks, and a row focus ring. No fixed container width, no `100vw`, no `overflow-x`.
- `todo-logic.js`: DOM-free logic in one IIFE with dual export (CommonJS `module.exports` in Node, `globalThis.TodoLogic` in the browser). Contains trim and blank validation, id generation, add, toggle and delete, the focus-after-delete plan, the storage codec (`serialize`, lenient `restore`), `resolveStorage`, a store and a controller. Storage is always injected. Reason: keeps business rules testable without a browser.
- `app.js`: thin DOM layer. Load guard (shows "The app could not load. Reload the page." if the logic script is missing), rendering through `textContent` and `setAttribute` only (no HTML sinks), delegated `change` handler for toggle, delegated `click` handler for delete with a guard against a second click of a double-click, and validation message handling.
- `test/todo-logic.test.js`: 249 tests in 31 suites using `node:test` and `node:assert/strict`. Covers the logic, storage failure modes, the UMD browser branch (via `vm`), id uniqueness and restore performance (added after code review), and source lint checks for unsafe DOM sinks and project layout.

Behaviour worth knowing:

- Storage key `todoApp.tasks`, value `{"version":1,"tasks":[{"id","text","completed"}]}`. Restore accepts the envelope or a bare array, trims text, drops entries without usable text, and repairs missing or duplicate ids. Corrupt, missing or throwing storage gives an empty list with no page error. If `localStorage` is unavailable the app still works for the session but does not persist, and shows no notice (decision Q-1).
- Duplicate task text is allowed, there is no length or count limit (decisions Q-1..Q-7).
- Code review fixes included: CR-1 (id uniqueness at the 15-digit boundary), CR-2 (linear-time id repair in `restore`), CR-3 (`controller.add` returns copies), CR-5 (stronger tests).

SDLC run records and changelog (new):

- `artifacts/KAN-3/`: `requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md`, `code-review.md`, `verification-report.md`, `state.json`, `log.md`, and this `pull-request.md`.
- `CHANGELOG.md`: one entry for KAN-3.

Framework files (approval-gated SDLC that ran KAN-3; included in the same commit):

- `.claude/agents/`: nine agent definitions. `sdlc-orchestrator.md` is the main-session agent: it runs the eight stages in order, delegates each stage to one specialist, keeps `artifacts/<KEY>/state.json` and `log.md`, and owns every approval and every Git/GitHub action (no commit, push or PR without the user's explicit approval of the exact target). The eight specialists are `requirements-analyst`, `architect`, `design-reviewer`, `implementation-planner`, `implementer`, `code-reviewer`, `verifier` and `pull-request-agent`, each with its stage's responsibilities, tool limits and boundaries.
- `.claude/hooks/`: Node scripts with no dependencies. `sdlc-lib.mjs` holds the shared state helpers (stage list, `state.json` creation and validation, SHA-256 drift check for approved `requirements.md` and `architecture.md`). `sdlc-cli.mjs` is the command-line helper (`init`, `status`, `verify`, `hash`). `guard-delivery.mjs` is a PreToolUse hook that is written to deny `git commit`, `git push`, `gh pr` and GitHub MCP write calls unless the matching approval is recorded in `state.json`, and to deny force, delete and mirror pushes, merges and any write to Jira or Confluence. `check-state.mjs` is a PostToolUse hook that warns after a Write or Edit if `state.json` is invalid or an approved requirements or architecture file has changed. `check-stage-status.mjs` is deleted; the four files above replace it.
- `.claude/settings.json`: makes `sdlc-orchestrator` the default agent, allows `node .claude/hooks/sdlc-cli.mjs *` without a prompt, and registers the two hooks (`guard-delivery.mjs` before Bash, PowerShell and MCP tools; `check-state.mjs` after Write and Edit).
- `.claude/skills/run-sdlc/SKILL.md`: the `/run-sdlc [ISSUE-KEY]` skill (manual invocation only). It points to the orchestrator protocol and tells the user to restart with `claude --agent sdlc-orchestrator` if another agent is the main agent.
- `.mcp.json`: one MCP server entry, `atlassian`, type `http`, URL `https://mcp.atlassian.com/v2/mcp`. It contains no tokens or other secrets.
- `CLAUDE.md`: project instructions summarising the framework: the orchestrator, the `artifacts/<KEY>/` run records, approval-gated commits, pushes and PRs, read-only Jira and Confluence, no credentials in files, observed results only, and the PR target (`adarsx/claude-agentic-sdlc-capstone`, base `main`).

Intentionally not changed or not included:

- `README.md` is intentionally unchanged: GitHub's existing README stays as it is.
- `docs/` and the `.docx` project brief are not part of this PR.

## Test Evidence

All figures are copied from `artifacts/KAN-3/verification-report.md` and the `testEvidence` list in `artifacts/KAN-3/state.json`, observed on 2026-11-25.

Node side (repo root, Node `v26.13.1`):

- `node --check todo-logic.js` and `node --check app.js`: exit 0, no output.
- `node --test`: exit 0. `tests 249`, `suites 31`, `pass 249`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 190.3`. Re-run after all browser work: same counts.
- Build: none. The app has no build step, no bundler, no `package.json` and no `node_modules`.

Browser side (ad hoc headless Chromium driven over the DevTools protocol by a throwaway script kept outside the repository, decision OD-1):

- Chrome 158.0.8127.38: 288 automated checks, 288 pass, 0 fail.
- Edge 158.0.4370.33: 288 automated checks, 288 pass, 0 fail.
- Origins: `file://` and a plain Node static server on `127.0.0.1`.
- Zero uncaught exceptions, console errors or dialogs in every scenario in both browsers (the deliberate guard scenario shows only the two expected blocked-request failures).
- Viewports checked: 320, 375, 768, 1280, 1920 px, plus 320 and 375 px with mobile emulation. `scrollWidth <= clientWidth` at each, controls at least 44x44, no overlapping controls.
- Network: exactly 4 requests on load (`index.html`, `styles.css`, `todo-logic.js`, `app.js`), none after load.
- Harness liveness check: removing `line-through`, the text-wrapping rules and the double-click guard on a scratch copy made 40 of 288 checks fail, so the checks are not vacuous.

Acceptance criteria: AC-1 through AC-15 all PASS (15 PASS, 0 FAIL, 0 NOT RUN at AC level), with the sub-items listed under Known Limitations not observed. Failures: none.

Code review (`artifacts/KAN-3/code-review.md`): final verdict Approved. CR-1, CR-2, CR-3 and CR-5 fixed and independently re-checked; CR-4 accepted deviation; CR-6, CR-7, CR-8 accepted; CR-9 to CR-11 informational.

## Known Limitations

Not run or not observable in verification (no claim is made for these):

- Screen reader announcements (NVDA, JAWS, VoiceOver, TalkBack). Only the accessibility tree was inspected. Re-announcement of a repeated identical error message was not observed.
- Real touch hardware. Only CDP-emulated touch taps and mobile viewport emulation were used.
- Firefox and Safari. Chrome and Edge are the same engine family, so only one engine was exercised.
- The `@supports not selector(:has(*))` CSS fallback. Both tested browsers support `:has()`, so the fallback was never exercised.
- Viewports were emulated, not real devices or window resizes. Keyboard events were synthetic, not a physical keyboard. Headless only. Zoom and text-size settings were not tested.
- Nothing was verified on a live production origin.
- A newline in a task cannot be typed into the single-line input, so that blank variant is covered by Node tests only.

Framework files (not verified):

- The verification stage tested the Todo app only. The framework files (`.claude/agents/`, `.claude/hooks/`, `.claude/settings.json`, `.claude/skills/run-sdlc/SKILL.md`, `.mcp.json`, `CLAUDE.md`) were not exercised by it, and no claim is made about their behaviour. In particular, the hooks (`guard-delivery.mjs`, `check-state.mjs`, `sdlc-cli.mjs`, `sdlc-lib.mjs`) were not run against denial, approval or drift scenarios, and the descriptions above come from reading the code. The Atlassian MCP connection in `.mcp.json` was not tested either.

Observations and accepted behaviours:

- O-1 / CR-7: the Add and Delete buttons rely on the browser's native focus ring, which is thin (`outline: auto 1px`) and low-prominence, especially on the blue Add button. The row and input rings are clear. Optional follow-up: an explicit `:focus-visible` outline.
- O-2: with very long task text at 320 px, the Delete button stretches to the row height (about 456 to 500 px). It stays operable and within the viewport.
- R-11: holding Enter or Space on a Delete button can delete several rows. Accepted; not exercised in verification.
- R-12: a second submit immediately after a successful add shows the blank-task message. Accepted.
- R-14: task text cannot be selected or copied by mouse or touch because the checkbox covers the whole row. Accepted.
- CR-4: the input uses `min-width: 44px` where `architecture.md` section 4.7 says `min-width: 0`. Accepted deviation. Verified in Chrome and Edge at 320 px: the input stays on the Add line (214 px wide) with no horizontal scroll.
- `architecture.md` section 4.4 still calls the 16-digit id rollover "harmless". That is outdated after the CR-1 fix (ids are now unique at the boundary). The architecture file was left unedited to keep its approved hash.
- When `localStorage` is unreachable the app gives no notice that tasks will not persist (by design, Q-1). A bad stored value stays in place until the next successful save.

## Reviewer Checklist

- [ ] Title, repository (`adarsx/claude-agentic-sdlc-capstone`), base (`main`) and head (`feature`) are as intended.
- [ ] `index.html`, `styles.css`, `todo-logic.js`, `app.js` match the described behaviour (add, trim and blank message, toggle, delete, empty state).
- [ ] No HTML sinks: user text reaches the DOM only through `textContent` and `setAttribute`.
- [ ] No secrets anywhere in the PR; the app files make no external requests; no new dependency, no `package.json`. The only external URL in the framework files is the Atlassian MCP endpoint in `.mcp.json`.
- [ ] `node --test` run locally (expected: 249 tests, 249 pass, 0 fail).
- [ ] Open `index.html` from disk: add, toggle, delete, reload, and confirm tasks persist in order.
- [ ] Narrow window (about 320 px) with a very long word: no sideways scroll, controls easy to tap.
- [ ] Tab through all controls and confirm focus is visible, especially on Add and Delete (see O-1).
- [ ] Optionally try Firefox and Safari, and a screen reader with a repeated blank submit (not covered by verification).
- [ ] Accepted limitations (CR-4, O-1, O-2, R-11, R-12, R-14, outdated architecture 4.4 wording) are acceptable for this release.
- [ ] The SDLC run records in `artifacts/KAN-3/` belong in this PR.
- [ ] Confirm the framework files belong in this PR: `.claude/agents/` (including `sdlc-orchestrator.md`), `.claude/hooks/`, `.claude/settings.json`, `.claude/skills/run-sdlc/SKILL.md`, `.mcp.json` and `CLAUDE.md`. They were not exercised by verification (see Known Limitations).
- [ ] `README.md` is unchanged in the PR diff, and `docs/` and the `.docx` brief are absent.
- [ ] The PR history is one commit on top of `main` (`b48d2c1`).
- [ ] The PR is left open for the user to merge (no merge by the agent).
