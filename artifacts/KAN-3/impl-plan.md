# KAN-3 Implementation Plan: Browser Todo app with persistent tasks

Inputs: `artifacts/KAN-3/requirements.md` (approved), `artifacts/KAN-3/architecture.md` (v2, approved, authoritative), `artifacts/KAN-3/design-review.md` (approved; DR-1..DR-14 already applied in architecture v2).
Scope change: none. No requirement or architecture change is proposed. This plan contains no code, only signatures and checklists.

Section references such as "arch 4.7" point to `architecture.md`.

## 1. Ground rules for the implementer

- Working branch is `feature` (existing). Do not commit, push or open a PR. The Orchestrator owns Git.
- Repository state seen while planning: greenfield for the app. No `package.json`, `index.html`, `styles.css`, `app.js`, `todo-logic.js`, `test/` or `*.test.js` file exists. `.gitignore` exists. `docs/` holds only `docs/codemie/analytics/*.json`, which does not match any `node --test` discovery pattern.
- Files the app may create (and no others): `index.html`, `styles.css`, `todo-logic.js`, `app.js`, `test/todo-logic.test.js`. All at the repository root (NFR-2), except the test file.
- **No helper files in `test/`** (arch 2). `node --test` runs every `.js`, `.cjs` or `.mjs` file under `test/`. Spy storage, throwing storage and fixtures live inside `test/todo-logic.test.js`.
- **No `package.json`** (arch 2, OD-3). Never add `"type": "module"`. Contingency in section 6.
- **No committed browser tooling** (no Playwright, jsdom, Puppeteer, Selenium, no browser scripts or config). Browser-only checks belong to the Verification stage (arch 8.2) and are run ad hoc or by checklist there.
- Test imports are limited to `node:test`, `node:assert/strict`, `node:fs`, `node:vm` (plus `node:path` if needed for file paths; it is a built-in).
- Both `todo-logic.js` and `app.js`: one IIFE, `"use strict"`, no `import`/`export` statements, no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, no URLs (arch 1.1, 4.1, 4.2, 8.1).
- `todo-logic.js`: no `window`, `self`, `document` or `localStorage` identifier anywhere, including in strings. Comments are stripped by the lint test, but strings are not, so do not use those words in message copy or error strings.
- Keep copy and comments free of lines that start with `import` or `export` (arch R-15).
- Report only observed results. Run the commands for real and quote the exit code and pass/fail counts from the actual output.
- Exported API (arch 6), fixed names so the tests, `app.js` and the lint agree: `STORAGE_KEY`, `STORAGE_VERSION`, `MESSAGES`, `validateText`, `submitOutcome`, `nextId`, `addTask`, `toggleTask`, `deleteTask`, `focusAfterDelete`, `serialize`, `restore`, `resolveStorage`, `createMemoryStorage`, `createStore`, `createController`.
- DOM element ids fixed here so `index.html` (T6), `styles.css` (T7) and `app.js` (T8) agree (arch 4.6 calls them illustrative): `#add-form`, `#task-input`, `#task-error`, `#task-list`, `#empty-state`. Classes: `task-main`, `task-check`, `task-box`, `task-text`, `task-delete`.

## 2. Task dependency overview

```
T1 -> T2 -> T3 -> T4 -> T5
T3 -> T8
T6 -> T7
T6 -> T8
T5, T8, T7 -> T9 -> T10
```

Recommended execution order: T1, T2, T3, T4, T5, T6, T7, T8, T9, T10.
Run `node --test` after every test task (T2, T4, T5, T9) and record the result.

## 3. Tasks

### T1. Logic core: wrapper, constants and pure list operations

- **Description.** Create `todo-logic.js` with the IIFE, `"use strict"` and the dual-export wrapper (arch 4.1 "Wrapper"): `module.exports = api` when `typeof module === "object" && module !== null && module.exports`, else `globalThis.TodoLogic = api`. Implement and export:
  - Constants: `STORAGE_KEY = "todoApp.tasks"`, `STORAGE_VERSION = 1`, `MESSAGES.blank` (contains the words "cannot be blank", for example "Task cannot be blank. Enter some text and try again.").
  - `validateText(raw)`: `trim()` per A-7; non-string is blank.
  - `nextId(tasks)`: ids matching `^t[0-9]{1,15}$` into a `Set`, max + 1, increment until unique; empty list gives `t1`.
  - `addTask(tasks, raw)`, `toggleTask(tasks, id)`, `deleteTask(tasks, id)`: pure, no mutation of inputs, act on id only, unknown id returns the list unchanged.
  - `focusAfterDelete(tasksBefore, id)`: next task, else previous, else `{ kind: "input" }`; unknown id gives `{ kind: "input" }`.
  - `submitOutcome(tasks, raw)`: success `{ ok: true, error: null, message: "", inputValue: "", focus: "input", task, tasks }`; blank `{ ok: false, error: "blank", message: MESSAGES.blank, inputValue: "", focus: "input", task: null, tasks (same content) }`.
  - Signatures: see arch 6. Other API members (codec, storage, store, controller) are added in T3.
- **Files to touch.** `todo-logic.js` (new).
- **Depends on.** none.
- **Blocked by.** none.
- **Covers.** FR-2, FR-3, FR-4, FR-5, FR-6 (state flip), FR-7 (list op and focus plan), FR-10 (`inputValue: ""`), NFR-5 (no DOM in logic), NFR-8; AC-1, AC-2, AC-3, AC-4, AC-5, AC-8, AC-9 (outcome half), AC-10 (logic half).
- **Acceptance checks (Node, run in T2).**
  1. `node -e "const t=require('./todo-logic.js'); console.log(Object.keys(t).sort().join())"` exits 0 and lists the T1 members. (Informal smoke only; the evidence is T2's `node --test`.)
  2. No `window`, `self`, `document`, `localStorage` text in the file outside comments (checked formally in T9).
  3. Operations return new arrays and never mutate the input (asserted in T2).
- **Test approach.** Covered by T2. No browser involvement.

### T2. Test suite, part 1: logic core

- **Description.** Create `test/todo-logic.test.js` (`node:test` `describe`/`test`, `node:assert/strict`) with a core section, `require("../todo-logic.js")`. Cases:
  - `validateText`: `""`, spaces, tab, `\n`, mixed whitespace, `null`, `undefined`, number, object are blank; `"  Buy milk  "` gives `Buy milk`.
  - `addTask`: trims text (AC-1); order A, B, C is preserved (AC-3); two `Same` tasks get different ids; input array not mutated.
  - Blank add leaves the list deep-equal and `task` is `null` (AC-2).
  - `toggleTask`: flips and flips back, other tasks untouched (AC-4); with two `Same` tasks, toggling the second leaves the first, and the reverse (AC-3); unknown id unchanged (same content).
  - `deleteTask`: deleting B of A,B,C gives A,C in order (AC-5); duplicate-named: deleting the second leaves the first, and the reverse (AC-3); unknown id unchanged.
  - `nextId`: empty gives `t1`; `t1,t2,t5` gives `t6`; non-matching ids (`a"]`, `__proto__`, 16-digit) ignored; increment-until-unique defence; deleted-highest id reuse is allowed.
  - `submitOutcome`: success and every blank variant produce the outcome shapes in T1, with `message === MESSAGES.blank` and `/cannot be blank/i`, `inputValue === ""`, `focus === "input"`, tasks unchanged on blank (AC-2, AC-8); a later valid submit has `message: ""` (AC-9 outcome half).
  - `focusAfterDelete`: middle (next), last (previous), only task (input), empty list (input), unknown id (input).
  - Text round trip for `<b>x</b><script>alert(1)</script>` through `addTask` is unchanged (AC-10 logic half).
- **Files to touch.** `test/todo-logic.test.js` (new).
- **Depends on.** T1.
- **Blocked by.** none. (If `node --test` cannot load the file as CommonJS, see section 6.)
- **Covers.** FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-10, NFR-3, NFR-8; AC-1, AC-2, AC-3, AC-4, AC-5, AC-8, AC-9 (outcome half), AC-10 (logic half), AC-14 (test runner part).
- **Acceptance checks.** `node --test` from the repo root exits 0, the core tests are discovered and pass, and no test file other than `test/todo-logic.test.js` exists. Record the pass count from the real output.
- **Test approach.** Node only (`node --test`).

### T3. Persistence layer: codec, storage resolution, store, controller

- **Description.** Extend `todo-logic.js` with:
  - `serialize(tasks)`: writes `{ "version": 1, "tasks": [...] }`.
  - `restore(raw)` per arch 4.3, never throws: null, undefined, non-string, empty or unparseable gives `[]`; a parsed array is accepted (bare array, OD-6); an object with an array `tasks` is accepted; anything else gives `[]`. Per item: non-null object, string `text` with non-blank trim, kept text trimmed; `completed` is `true` only if exactly `true`; version field ignored. Ids in two passes: a valid id matches `^t[0-9]{1,15}$` and is not in the accepted `Set`; pass 1 keeps valid ids, pass 2 assigns fresh `nextId` values over the full set, in item order (`["t1", missing, "t1", "t5"]` gives `t1, t6, t7, t5`). Fresh objects with the three known fields only.
  - `resolveStorage(getter)`: try/catch around `getter()`; returns the value only if non-null with function `getItem` and `setItem`, else `null`; never throws.
  - `createMemoryStorage()`: `Map`-backed `getItem`/`setItem`; test double only.
  - `createStore({ storage, key })`: `load()` returns `[]` for no storage or a throwing `getItem`, else `restore(getItem(key))`; `save(tasks)` returns `true` or `false`, swallows `setItem` errors; no in-memory mirror; no `isPersistent`. Default key is `STORAGE_KEY`.
  - `createController({ store })`: loads once at construction; the constructor never calls `store.save`. `getTasks()`, `add(raw)` (saves only when `ok`), `toggle(id)` (returns `true` and saves only when a task changed), `remove(id)` (returns `{ changed, focus }` using `focusAfterDelete` on the list before deleting; saves only when changed).
  - Add all of these to the exported `api`.
- **Files to touch.** `todo-logic.js`.
- **Depends on.** T1.
- **Blocked by.** none.
- **Covers.** FR-5 (unique ids on restore), FR-8, FR-9, NFR-5 (rebuild fresh objects), NFR-7, NFR-8; AC-6, AC-11, AC-12, AC-15 (logic half), AC-10 (round trip).
- **Acceptance checks.** The `node -e` smoke from T1 still loads the file and now also lists the T3 members. The formal checks are in T4.
- **Test approach.** Covered by T4.

### T4. Test suite, part 2: restore, storage, store, controller

- **Description.** Add a persistence section to `test/todo-logic.test.js`. Define the spy storage (counts `setItem` calls, records values), throwing storage (`getItem` and `setItem` throw) and any other fixtures inside the file. Cases:
  - `serialize`/`restore` round trip keeps text, order and completion state.
  - `restore` of `"{bad"`, `"42"`, `"null"`, `"\"str\""`, `"{\"a\":1}"`, `"{\"version\":1,\"tasks\":\"x\"}"`, `""`, `null`, `undefined`, non-string gives `[]` (AC-11, AC-15).
  - Envelope with another `version` still loads; a bare array loads (OD-6).
  - Mixed items: non-objects, missing or non-string text, blank text dropped; valid subset kept; text `"  x  "` restored as `x`; `completed` `"true"`, `1`, missing become `false`; extra fields not copied.
  - Odd ids: `a"]`, `__proto__`, `constructor`, `""`, numeric `5`, a 16-digit id, duplicates, missing: all replaced; assert exact two-pass outputs, including `["t1", missing, "t1", "t5"]` gives `t1, t6, t7, t5`; resulting ids are unique and all match `^t[0-9]{1,15}$`.
  - `resolveStorage`: throwing getter, getter returning `null`, `undefined`, an object without functions, and a valid storage.
  - `createStore`: `load` and `save` never throw with `null`, `undefined` and throwing storage; `save` returns `false` there and `true` on a good storage; a later `save` retries real storage.
  - Controller with spy storage: `add` valid saves exactly once and stored JSON has trimmed text (AC-1); each blank variant makes zero `setItem` calls and tasks deep-equal before and after (AC-2); toggle and remove save once each and a no-op (unknown id) saves zero times (FR-8); constructing a controller over seeded storage with bad items and repairable ids makes zero `setItem` calls (arch 4.1); `remove(...).focus` plan for middle, last, only task, and unknown id.
  - Refresh simulation (AC-6): controller 1 on a `createMemoryStorage()` adds A, B, C, toggles B, deletes A; controller 2 on the same storage returns the identical tasks, order and states, and no deleted task.
  - AC-11 recovery: controller over bad JSON starts empty, `add` works, and the next save overwrites the bad value.
  - AC-12: controller over a throwing storage and over `null` storage starts empty, `add` returns `ok`, `getTasks()` shows the task, nothing throws, `save` returns `false`.
  - AC-10: `<b>x</b><script>alert(1)</script>` survives add, serialize, restore unchanged.
  - AC-3 persistence: two `Same` tasks keep independent state after restore.
- **Files to touch.** `test/todo-logic.test.js`.
- **Depends on.** T3 (and T2, same file).
- **Blocked by.** none.
- **Covers.** FR-5, FR-8, FR-9, NFR-3, NFR-5, NFR-7, NFR-8; AC-1, AC-2, AC-3, AC-5, AC-6, AC-10, AC-11, AC-12, AC-15 (logic half).
- **Acceptance checks.** `node --test` exits 0 with all T2 and T4 tests passing; no test is skipped. Record the pass count from the real output.
- **Test approach.** Node only.

### T5. Test: UMD browser branch (vm)

- **Description.** Add a `vm` test to `test/todo-logic.test.js`. Read `todo-logic.js` with `node:fs`; run it with `vm.runInContext` in a fresh empty `vm.createContext({})` (no `module`, no `require`, no browser globals). Assert: running throws nothing; `ctx.TodoLogic` exists; it exposes every function and constant listed in section 1 with the right `typeof`; a spot call works (for example `ctx.TodoLogic.validateText("  a ")` gives text `a`). Compare any array or object results with `JSON.stringify` or a copy, not `deepStrictEqual` against outer-realm literals (cross-realm prototypes, arch 8.1). Also assert the file does not set `module.exports` in that context (there is no `module`).
- **Files to touch.** `test/todo-logic.test.js`.
- **Depends on.** T3 (full API must exist).
- **Blocked by.** none.
- **Covers.** NFR-1, NFR-8, AC-14 (browser branch loads with no load-time browser globals).
- **Acceptance checks.** `node --test` exits 0 with the vm test passing.
- **Test approach.** Node only. This is the Node-side proof of the browser export branch. Actual `file://` load is browser-only (Verification).

### T6. `index.html`

- **Description.** Create `index.html` per arch 2 and 4.6:
  - `<html lang="en">`, `<meta charset>`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, a title, `<link rel="icon" href="data:,">`, `<link rel="stylesheet" href="styles.css">`.
  - `<main>` with `<h1>`; `<form id="add-form" novalidate>`; visible `<label for="task-input">New task</label>`; `<input id="task-input" type="text" autocomplete="off" aria-describedby="task-error">`, no `required`; `<button type="submit">Add</button>`.
  - `<p id="task-error" role="alert"></p>` always rendered and empty on load.
  - `<p id="empty-state">No tasks yet. Add one above.</p>` and `<ul id="task-list">`. Initial state is acceptable for either, because `app.js` sets `hidden`; do not ship static task markup.
  - `<noscript>` line saying the app needs JavaScript.
  - `<script src="todo-logic.js" defer>` then `<script src="app.js" defer>` (in that order, classic, no `type="module"`, no `crossorigin`).
  - No external fonts, CDNs, images, `http(s)://` or protocol-relative URLs. Page loads `index.html` plus exactly three subresources (`styles.css`, `todo-logic.js`, `app.js`).
- **Files to touch.** `index.html` (new).
- **Depends on.** none for creation (the contract of ids is in section 1). Doing it after T5 is only for ordering.
- **Blocked by.** none.
- **Covers.** FR-1, FR-11, NFR-1, NFR-2, NFR-6 (label, live region, native controls), AC-13 (native controls), AC-14, AC-15 (static empty-state element).
- **Acceptance checks.**
  1. File inspection: all five ids exist; scripts are `todo-logic.js` then `app.js`, both `defer`; no `crossorigin`, no `type="module"`, no `required`, no URL schemes, no `<script>` content inline.
  2. Formally asserted by T9 lint.
- **Test approach.** Node lint (T9) for source hygiene. Rendering, the live region in the accessibility tree and `file://` loading are browser-only (Verification).

### T7. `styles.css`

- **Description.** Create `styles.css` mobile-first, implementing every mandatory rule in arch 4.6 and 4.7:
  - `*, *::before, *::after { box-sizing: border-box }`; `[hidden] { display: none !important }`.
  - `.app`/`main` `max-width: 40rem; margin: 0 auto; padding: 1rem`. No `100vw`, no fixed container widths, no `overflow-x: hidden`.
  - Add form: flex, gap; input `flex: 1; min-width: 0; font-size >= 16px`; Add button `flex: none`.
  - Every control `min-height: 44px; min-width: 44px` in literal px; at least 4 px between adjacent targets; `touch-action: manipulation` on buttons.
  - Row `li`: flex, `align-items: stretch`, gap. `.task-main`: `position: relative; isolation: isolate; flex: 1; min-width: 0; min-height: 44px; display: flex; align-items: center`. `.task-check`: `position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; z-index: 1`. `.task-box` and `.task-text` stay `position: static`. `.task-text`: `overflow-wrap: anywhere; word-break: break-word; white-space: normal`.
  - Completed state not by colour alone: `.task-box` has a `currentColor` border; `.task-check:checked ~ .task-box::after { content: "\2713" }` (text glyph); `.task-check:checked ~ .task-text { text-decoration: line-through }`.
  - Focus ring on the row: `.task-main:has(.task-check:focus-visible) { outline: 2px solid ...; outline-offset: 2px }`, with `@supports not selector(:has(*))` fallback on `.task-check:focus-visible ~ .task-box`. Use `outline`, not `box-shadow`. Never remove native `:focus-visible` outlines on the text input and buttons.
  - `#task-error:empty { height: 0; margin: 0; padding: 0; overflow: hidden }` and never `display: none` on it; a visible style for the non-empty message.
  - No media query removes or hides a control. At most one `@media (min-width: 40rem)` for padding and type size.
  - Body text contrast target 4.5:1 (design goal, not a requirement).
- **Files to touch.** `styles.css` (new).
- **Depends on.** T6 (class and id names).
- **Blocked by.** none.
- **Covers.** FR-6 (distinct completed look), FR-11 (hidden rule), NFR-4, NFR-6, NFR-1; AC-4, AC-7, AC-13, AC-15.
- **Acceptance checks.**
  1. Inspection against the checklist above; every bullet is present.
  2. T9 lint: no `http(s)://`, no protocol-relative URL.
  3. Rendering, measurements and focus-ring checks are browser-only.
- **Test approach.** Not testable under `node --test` beyond the lint. AC-4 visual, AC-7 and AC-13 focus ring are verified in the browser (section 5).

### T8. `app.js` DOM layer

- **Description.** Create `app.js` (IIFE, `"use strict"`, exports nothing, no business rules) per arch 4.2:
  1. **Load guard first:** if `typeof globalThis.TodoLogic === "undefined"`, replace `<main>` contents with a static message via `textContent` (for example "The app could not load. Reload the page.") and return.
  2. **Startup:** `TodoLogic.resolveStorage(function () { return window.localStorage; })`, then `createStore({ storage })`, `createController({ store })`, `render(controller.getTasks())`. No try/catch around storage access.
  3. **Submit** on `#add-form`: `event.preventDefault()` is the **first statement**; then `controller.add(input.value)`; apply the outcome: message text into `#task-error`, `aria-invalid` true only when `ok` is false, input value from `outcome.inputValue`, re-render, focus the input. Optional clear-then-set on `setTimeout` 0 for repeated messages.
  4. **`input` event** on `#task-input` clears the message and `aria-invalid` (A-4, AC-9).
  5. **Toggle:** one delegated `change` listener on `#task-list`, acting only when `event.target` has class `task-check`; id from the closest `li`'s `dataset.id`; `controller.toggle(id)`; re-render; re-focus that task's checkbox.
  6. **Delete:** one delegated `click` listener on `#task-list`, acting only when `event.target.closest(".task-delete")` matches; ignore `event.detail > 1`; `controller.remove(id)`; re-render; focus the Delete button or input from the returned `focus` plan.
  7. **Row lookup** iterates `ul.children` and compares `dataset.id`; never builds a CSS selector from an id.
  8. **Render** rebuilds the list with `replaceChildren`, `createElement`, `textContent`, `setAttribute`, `dataset`; each row is `<li data-id>` containing `<label class="task-main">` with `input.task-check` (first in the label), `span.task-box[aria-hidden=true]`, `span.task-text`, plus a sibling `<button type="button" class="task-delete" aria-label="Delete: <text>">Delete</button>`. Sets `checked` from `completed`. Shows or hides `#empty-state` and `#task-list` with the `hidden` attribute so exactly one is visible.
  - Holds no state other than DOM references.
- **Files to touch.** `app.js` (new).
- **Depends on.** T3 (API), T6 (ids and markup contract). T7 is needed for a meaningful look but not to write the file.
- **Blocked by.** none.
- **Covers.** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, NFR-5, NFR-6, NFR-7, AC-1..AC-6, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-15.
- **Acceptance checks.**
  1. Inspection: matches each bullet; uses no HTML-string sinks and no `import`/`export`.
  2. T9 lint passes against it.
  3. `node --check app.js` exits 0 (syntax only; optional informal check, since `app.js` is never `require`d by tests and must not be).
  4. Behavioural checks are browser-only (section 5).
- **Test approach.** Node lint (T9) for source hygiene; decisions it applies are already tested in T2 and T4. DOM behaviour is browser-only (Verification).

### T9. Test suite, part 3: source lint

- **Description.** Add a lint section to `test/todo-logic.test.js` that reads the source files with `node:fs` (arch 8.1):
  - `app.js` and `todo-logic.js`: none of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` (word-boundary matches).
  - `app.js`, `todo-logic.js`, `index.html`, `styles.css`: no `https?://`; no protocol-relative URL, matched only after a quote, parenthesis or `=` (for example `["'(=]\s*//[a-z0-9]`).
  - `app.js` and `todo-logic.js`: no `^\s*(import|export)\b` per line (multiline flag) and no `\bimport\s*\(`.
  - `todo-logic.js` with `//` and `/* */` comments stripped first: no `\bwindow\b`, `\bself\b`, `\bdocument\b`, `\blocalStorage\b`.
  - `index.html`: no `crossorigin`, no `type="module"` or `type='module'`; `todo-logic.js` is referenced before `app.js`; the five fixed ids are present.
  - Repository layout: `test/` contains exactly `todo-logic.test.js`; no `package.json` at the root (so the shipped app has no dependencies, AC-14).
  - Sanity: each linted file exists and is non-empty, so the lint cannot pass vacuously.
- **Files to touch.** `test/todo-logic.test.js`.
- **Depends on.** T5, T6, T7, T8 (files must exist).
- **Blocked by.** none.
- **Covers.** NFR-1, NFR-2, NFR-3, NFR-5, NFR-8, AC-10 (source half), AC-14.
- **Acceptance checks.** `node --test` exits 0; deliberately confirming the lint is live is optional (for example, temporarily introducing a forbidden token and seeing it fail, then removing it; report it only if actually done).
- **Test approach.** Node only.

### T10. Final local check run and handoff note

- **Description.** From the repo root, run `node --test` and record the real exit code, total, pass, fail and skipped counts. Confirm by listing files that the app consists only of `index.html`, `styles.css`, `todo-logic.js`, `app.js`, `test/todo-logic.test.js`, with no `package.json`, no `node_modules` and no helper files in `test/`. Run `git status` and confirm only those five files (plus the existing `artifacts/KAN-3/` records) were added by the implementation. Write a short implementation summary for the Orchestrator listing: per-AC which part is Node-verified (with test names) and which remain browser-only; any deviations; any contingency triggered. Do not commit.
- **Files to touch.** none (read-only checks). The implementation report goes in the stage's reply and the Orchestrator's artifact, not in a new repo file.
- **Depends on.** T9.
- **Blocked by.** none.
- **Covers.** NFR-1, NFR-2, NFR-3, NFR-8, AC-14 (Node and inspection parts); consolidates AC-1..AC-6, AC-8..AC-12, AC-15 Node parts.
- **Acceptance checks.** `node --test` exits 0 with zero failures and zero skips; repository layout as above; final list of Node-covered versus browser-only ACs matches section 4.
- **Test approach.** Node only. No browser run is required of the implementer; any informal browser smoke the implementer happens to do must be labelled informal and does not replace Verification.

## 4. Verification split: Node versus browser (arch 8.2 and 8.3)

`N` = covered by `node --test` (task that adds it). `B` = browser-only, belongs to the Verification stage. No committed browser tooling.

| AC | Node (`node --test`) | Browser only (Verification) |
|---|---|---|
| AC-1 | N: `add("  Buy milk  ")` trims, saves once (T2, T4) | Type, submit, see `Buy milk`; stored JSON trimmed |
| AC-2 | N: all blank variants, list unchanged, zero `setItem`, message and `inputValue` (T2, T4) | Message visible; list and raw `localStorage` unchanged (a newline cannot be typed in a single-line input; Node covers it) |
| AC-3 | N: order, duplicate-named independence (T2, T4) | Same flow in UI |
| AC-4 | N: toggle flips and back (T2) | B: tick glyph and line-through shown, not colour alone; toggle again restores |
| AC-5 | N: delete B of A,B,C (T2, T4) | UI delete; list A,C |
| AC-6 | N: two controllers on `createMemoryStorage()` (T4) | Real reload (F5) comparison |
| AC-7 | none | B only: 320, 375, 768, 1280 px (spot-check 1920): `scrollWidth <= clientWidth`; rects of input, Add, each checkbox input and Delete at least 44x44; no sibling-control overlap; long text wraps |
| AC-8 | N: outcome `inputValue === ""` (T2) | B: input value empty after add |
| AC-9 | N: later valid outcome has `message: ""` (T2) | B: clear on input, clear on next valid add (DOM-only rule) |
| AC-10 | N: round trip, source lint (T4, T9) | B: literal text, no `b`/`script`/`img` elements, no dialog, same after reload |
| AC-11 | N: all seed values, subset recovery, odd ids (T4) | B: seed exact bad values via script (not a valid envelope), reload, empty list, no page error, add works |
| AC-12 | N: throwing getter, throwing and null storage (T4) | B: init script making `localStorage` throw; add; no page error |
| AC-13 | N: `focusAfterDelete` and `remove().focus` only (T2, T4) | B: keyboard-only add, toggle, delete; focus ring on every control (checkbox ring on `.task-main` or `.task-box`, not the input); focus placement |
| AC-14 | N: `node --test` runs, vm browser branch, lint (T5, T9, T10) | B: `file://` open with no server; `index.html` plus three subresources, no outbound request |
| AC-15 | N: `restore(null)`, empty controller (T4) | B: fresh profile shows empty-state text, list hidden, no error |

ACs with a browser-only component (AC-4, 7, 9, 13 and the UI halves of the rest) must be reported by the Verification stage with the method used (automated ad hoc or manual checklist) or listed as unverified, per arch 8 and OD-1. Browser tooling is not configured in this repo (`.mcp.json` lists only Atlassian), so this is a known Verification risk (arch R-1). It does not block implementation.

### 4.1 Verification-stage hygiene to hand to the Verification stage (arch 8.2, DR-13)

- Clear `todoApp.tasks` before each scenario (for example `localStorage.removeItem("todoApp.tasks")` or `todoApp.tasks` cleared by script), because Chromium commonly shares one `file://` storage across local copies of the app. The same applies to the list on a static server.
- Record the browser (name and version) and the origin type (`file://` or static server) next to each AC result. Verify persistence on `file://` in at least one browser and on a static server.
- Required extra browser checks (arch 8.2): click on task text, the drawn box and the row's empty area each toggle exactly once; double-click Delete removes only that row; with `TodoLogic` blocked the page does not navigate and the guard message shows; with the page idle `#task-error` is in the accessibility tree with zero height and its text is present after a blank submit; empty state and list never show together.
- Report accepted limitations as such, not as defects: held Enter or Space on Delete can delete several rows (R-11); a second Enter right after a successful add shows the blank message (R-12); task text cannot be selected by mouse or touch (R-14).

## 5. Requirement traceability

Every task traces to at least one requirement (column "Tasks").

| Requirement | Tasks |
|---|---|
| FR-1 | T6, T8 |
| FR-2 | T1, T2, T4, T8 |
| FR-3 | T1, T2, T4, T8 |
| FR-4 | T1, T2, T3, T8 |
| FR-5 | T1, T2, T3, T4, T8 |
| FR-6 | T1, T2, T7, T8 |
| FR-7 | T1, T2, T4, T8 |
| FR-8 | T3, T4, T8 |
| FR-9 | T3, T4, T8 |
| FR-10 | T1, T2, T8 |
| FR-11 | T6, T7, T8 |
| NFR-1 | T5, T6, T7, T9, T10 |
| NFR-2 | T6, T9, T10 |
| NFR-3 | T2, T4, T9, T10 |
| NFR-4 | T7 (browser-verified) |
| NFR-5 | T1, T3, T4, T8, T9 |
| NFR-6 | T6, T7, T8 |
| NFR-7 | T3, T4, T8 |
| NFR-8 | T1, T2, T3, T4, T5, T9, T10 |
| AC-1 | T1, T2, T4, T8 |
| AC-2 | T1, T2, T4, T8 |
| AC-3 | T1, T2, T4, T8 |
| AC-4 | T1, T2, T7, T8 |
| AC-5 | T1, T2, T4, T8 |
| AC-6 | T3, T4, T8 |
| AC-7 | T7 (browser-verified) |
| AC-8 | T1, T2, T8 |
| AC-9 | T1, T2, T8 |
| AC-10 | T2, T4, T8, T9 |
| AC-11 | T3, T4, T8 |
| AC-12 | T3, T4, T8 |
| AC-13 | T1, T6, T7, T8 |
| AC-14 | T2, T5, T6, T9, T10 |
| AC-15 | T3, T4, T6, T7, T8 |

No task adds a feature outside the requirements. A README is deliberately not planned: no requirement calls for one, and AC-14 needs only that `index.html` opens and `node --test` runs.

## 6. Blocked tasks

None. No task is blocked by an unresolved question or missing input. Conditional items:

- **Contingency C-1 (arch 2, OD-3, R-13).** If the first `node --test` run (T2) fails because Node cannot load `todo-logic.js` as CommonJS (for example an ancestor `package.json` with `"type": "module"`), stop. T2 and everything after it become blocked until the user confirms adding a minimal root `package.json` with `"private": true` and `"type": "commonjs"` and no dependencies. Do not add it unconfirmed, and never add `"type": "module"`. Planning-time observation: no `package.json` exists in the repository root, and the design review found none in the parent `Copilot-Capstone` folder (directories above that were not checked). Not run by this plan.
- **Risk R-1 / OD-1 (not a blocker for implementation).** Browser tooling for Verification is not configured. This affects only the Verification stage's method, which must be reported honestly. Needs a decision before that stage, not before T1.

## 7. Definition of done

The implementation stage is done when all of these hold, each observed and not assumed:

1. `index.html`, `styles.css`, `todo-logic.js`, `app.js` exist at the repository root and `test/todo-logic.test.js` exists; no other new files, no `package.json`, no `node_modules`, no helper file in `test/`, no browser tooling committed.
2. `node --test` from the repo root exits 0 with zero failures and zero skips. The real counts are recorded in the implementation report. The suite includes the T2, T4, T5 and T9 groups.
3. Tasks T1..T10 are complete and each acceptance check is run, with results reported as observed (a check not run is reported as not run).
4. Source hygiene (lint, T9) passes: no HTML-string sinks, no URLs, no `import`/`export`, no browser globals in `todo-logic.js`, no `crossorigin` or `type="module"`, script order correct.
5. `app.js` matches arch 4.2 (load guard, `preventDefault()` first, delegated `change` toggle, delegated `.task-delete` click with `detail > 1` ignored, no selector built from ids) and `styles.css` carries every mandatory rule listed in T7.
6. Nothing in the delivered app is outside the requirements (no filters, editing, due dates, build step, framework, notice about storage failure).
7. The implementation report lists, per AC, the Node-verified part and the part left to the Verification stage (section 4), with the hygiene notes in section 4.1 passed on.
8. Nothing is committed, pushed or opened as a PR by the implementer.
