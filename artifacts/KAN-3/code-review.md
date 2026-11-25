# KAN-3 Code Review

Stage 6. Reviewer: Code Reviewer. Inputs: `requirements.md` (FR-1..11, NFR-1..8, AC-1..15), `architecture.md` (v2, authoritative), `impl-plan.md`.
Scope reviewed (all untracked, uncommitted on branch `feature`): `todo-logic.js`, `app.js`, `index.html`, `styles.css`, `test/todo-logic.test.js`. SDLC framework files and other artifacts were ignored except as references.

Status: first review done; resolution round and re-review done (sections 5 and 5a). Final verdict after fixes: **Approved** (see 5a).

## 1. Summary

Verdict of the first review: **acceptable with changes**. No blocker and no high-severity finding. The implementation follows the v2 architecture closely and I found no requirement it contradicts. I did find one verified correctness defect in id generation (CR-1), one verified performance defect in `restore` (CR-2), and a few lower-severity items.

Observed results of the first review (commands run in that review, read-only):
- `node --check todo-logic.js` and `node --check app.js`: no syntax errors.
- `node --test` (from the repo root, no arguments): 235 tests, 31 suites, 235 pass, 0 fail.
- Ad hoc `node -e` probes against `require("./todo-logic.js")` produced the evidence cited in CR-1, CR-2, CR-3. Nothing was edited.
- Nothing was run in a browser. Every browser-dependent statement below is labelled **unverified**.

Counts: 0 blocker, 0 high, 2 medium, 5 low, 3 info.

## 2. What was checked and found correct

Logic (`todo-logic.js`), read and probed:
- UMD wrapper: IIFE, `"use strict"`, `typeof module === "object" && module !== null && module.exports`, else `globalThis.TodoLogic`. No `window`, `self`, `document` or `localStorage` identifier. The `vm` tests cover the browser branch. OK.
- `restore` two-pass id repair: pass 1 accepts first-seen valid ids, pass 2 assigns fresh ids over the full accepted set in item order. `["t1", missing, "t1", "t5"]` gives `t1, t6, t7, t5` (also confirmed `t1,t1,t2` gives `t1,t3,t2`). Fresh objects are built from three fields only, so `__proto__` keys are inert. Text is trimmed, blank text is dropped, `completed` is true only for `=== true`. OK, except the boundary case in CR-1.
- `resolveStorage`: the getter call and the `getItem`/`setItem` property reads are all inside the `try`. A throwing getter, a throwing property getter, null, undefined, primitives and a non-function getter all return `null` (probed). OK.
- `createStore`: `load` and `save` wrap every storage call and `restore`/`serialize` in `try`. A hostile `getItem` accessor gives `[]` and `false` (probed). OK. (See CR-9 for the narrow non-contract case.)
- Controller: the constructor only calls `store.load()`. `add` saves only when `outcome.ok`. `toggle` and `remove` save only after confirming the id exists. Unknown ids return `false` / `{changed:false, focus:{kind:"input"}}` with no save. `getTasks()` returns fresh copies. Verified by reading and by the spy tests. (`add`'s return value leaks internals: CR-3.)
- `focusAfterDelete`: next, else previous, else input, unknown id gives input. Computed before the delete. OK.
- `nextId` precision: with the 15-digit cap, `max + 1` stays below 2^53. OK. (Uniqueness at the cap: CR-1.)

DOM layer (`app.js`), by reading:
- Load guard first, uses `textContent`. No try/catch around storage; `resolveStorage` owns it. No HTML sinks. Row text via `textContent`, `aria-label` via `setAttribute("aria-label", "Delete: " + task.text)`, id via `dataset.id`. No selector is built from an id (`findRow` iterates `list.children`; `focusInRow` builds `"." + className` from a constant only). OK.
- `submit`: `preventDefault()` is the first statement. Outcome is mapped (message or clear, `aria-invalid`, input value, render, focus input). OK.
- `change` delegated on the list, acts only on `.task-check`, resolves the row with `closest("li")` and a parent check, then toggles, re-renders and re-focuses that checkbox. One user action gives one `change` event. OK.
- `click` delegated, returns early on `event.detail > 1`, matches only `.task-delete` through `closest`, so clicks on the label, its input or the row never delete. Keyboard activation has `detail === 0`. Focus follows the plan, with an input fallback if the target row is missing. OK. Real pointer `detail` behaviour is **unverified**.
- `hidden` toggling: `setHidden` adds or removes the attribute on both the empty state and the list, and `styles.css` has `[hidden] { display: none !important }`. OK.
- Stale-message timing: the pending `setTimeout` only writes when `input` still has `aria-invalid="true"`. `clearMessage` (called on any `input` event and on any successful add) removes that attribute and the text together, so a pending callback cannot show a stale message after the user typed or after a successful add. `aria-invalid` and the message text are always set and cleared as a pair, so the guard is sound. Two blank submits queued in one tick can at worst re-set identical text. Reasoned from code; not run in a browser.

CSS and HTML, by reading (rendering **unverified**):
- Mandatory 4.7 rules present: `*{box-sizing}`, `[hidden]` rule, `.app` max-width/centering, `.task-main { position: relative; isolation: isolate; flex: 1; min-width: 0; min-height: 44px }`, `.task-check { position: absolute; inset: 0; width/height: 100%; opacity: 0; z-index: 1 }`, `.task-box` and `.task-text` `position: static`, `.task-text` wrapping (`overflow-wrap: anywhere; word-break: break-word; white-space: normal` with `min-width: 0`), `touch-action: manipulation` on buttons, literal 44 px minimums on buttons, input and checkbox, glyph tick via `.task-check:checked ~ .task-box::after`, line-through, `:has(:focus-visible)` outline on the row with the `@supports not selector(:has(*))` fallback in a separate block (correct: an unsupported selector would otherwise invalidate a combined rule), live region collapsed with `:empty { height:0 ... overflow:hidden }` and never `display:none`. No `100vw`, no fixed container width, no `overflow-x`.
- Form wrapping at 320 px (reasoning, **unverified**): the label is `flex: 1 0 100%`, the input `flex: 1` with `min-width: 44px`, the Add button `flex: none`. The hypothetical size of input plus gap plus button is well under 288 px, so they should stay on one line below the label, with the input absorbing the slack.
- `index.html`: `lang`, viewport, `data:` favicon, `<label for>`, `aria-describedby`, `role="alert"` on an always-present empty `<p>`, `novalidate`, no `required`, two classic deferred scripts in the right order, no `crossorigin`, no `type=module`, `<noscript>`. OK.
- No secrets, no dependency, no `package.json`, no network reference.

AC coverage summary:

| AC | Status |
|---|---|
| AC-1, 2, 3, 5, 6, 8 (outcome), 9 (outcome half), 11, 12, 15 (logic) | Verified by Node tests (observed pass) |
| AC-10 | Logic round trip and source lint verified. Actual DOM rendering **unverified** |
| AC-14 | Lint, `vm` and `node --test` verified. `file://` loading and "no network request" **unverified** |
| AC-4, AC-7, AC-9 (clear-on-input), AC-13, AC-15 (empty-state visible) | Browser only. **Unverified** |

## 3. Findings

(Original findings as raised in the first review. Line numbers refer to the code as it was then; see section 5 for the current state.)

### CR-1 (Medium): `nextId` can return a duplicate id at the 15-digit boundary; the increment-until-unique loop is unreachable

- Location: `todo-logic.js:39-62` (`nextId`), used by `addTask` (`:70`) and by `restore` pass 2 (`:218-222`).
- Description: only ids matching `ID_PATTERN` (1 to 15 digits) are added to `seen`, and `max` comes from the same set. So `candidate = max + 1` always has a larger number than every id in `seen`, and `seen.has("t" + candidate)` can never be true. The `while` loop at `:58-60` is dead code, which is why the implementer could not cover it. The loop was meant as the uniqueness defence (arch 4.4), but the defence does not work where it matters. Once an id reaches 16 digits (`t1000000000000000`, produced from a stored `t999999999999999`), that id no longer matches the pattern, is ignored by the next `nextId`, and the same id is generated again. Verified:
  - `addTask` twice on `[t999999999999999]` gives ids `t999999999999999, t1000000000000000, t1000000000000000`, and `toggleTask` on the second flips both (`[false, true, true]`).
  - `restore` of `[{id:"t999999999999999"},{text:"b"},{text:"c"}]` gives `t999999999999999, t1000000000000000, t1000000000000000`. This breaks the "ids unique after restore" claim and FR-5 (independent identity), and `restore` is also covered by the existing test only for a single repair after the 15-digit id (`test:724-729`).
- Trigger is extreme (a hand-edited 15-digit id), and arch 4.4 called the rollover "harmless". It is harmless for one id but not for two, so the stated rationale does not hold.
- Recommended fix: make uniqueness real. Either add every string `id` found in the list to `seen` (not only pattern matches) so the loop becomes reachable, or generate repair ids from a single running counter that is checked against the `Set` (see CR-2). Then add tests: two or more repairs after `t999999999999999` give distinct ids; two sequential `addTask` calls from `[t999999999999999]` give distinct ids; and a case that makes the loop body execute (for example a list containing the string id the candidate would produce).

### CR-2 (Medium): `restore` pass 2 is quadratic; 20,000 id-less items took about 38 s

- Location: `todo-logic.js:215-222` (calls `nextId(known)` once per repaired item, and `nextId` rebuilds a `Set` and rescans `known` each time).
- Description: observed with `restore(JSON.stringify(20000 items without id))`: 37,738 ms, versus 21 ms for 20,000 items with valid ids. A page load would freeze for that long with legacy or hand-seeded data that lacks ids (NFR-7 asks for resilience). The app itself always writes ids, so this is reachable only through seeded or foreign data; likelihood is low, impact is a frozen tab.
- Recommended fix: in pass 2 compute the starting maximum once from `accepted`, then allocate ids with a running counter and a `Set` membership check (this also fixes CR-1). Keep the result identical to the current examples (`t1, t6, t7, t5` etc.); the existing tests pin that. Optionally add a test that restores several thousand id-less items and asserts distinct ids (a regression guard that is quick once linear).

### CR-3 (Low): `controller.add` returns the controller's internal array and task object

- Location: `todo-logic.js:308-315`.
- Description: `tasks = outcome.tasks; ...; return outcome;` hands the caller the live `tasks` array and the live `task` object. Verified: after `o = c.add("A")`, `o.tasks.push(...)` and `o.task.text = "mut"` changed `getTasks()` to `[{id:"t1", text:"mut"}, {id:"t9", text:"evil"}]` with no save. This contradicts the encapsulation intent of "getTasks returns copies". `app.js` does not mutate the outcome, so there is no current bug.
- Recommended fix: return a shallow copy of the outcome with `tasks: tasks.map(copyTask)` and `task: copyTask(task)` (or drop `tasks` from the controller's return value, since `app.js` only reads `ok`, `message`, `inputValue`, `focus`). Add a test mirroring the `getTasks` copy test for `add`'s return value.

### CR-4 (Low): minor deviation from architecture 4.7 on the input's `min-width`

- Location: `styles.css:53-57`.
- Description: arch 4.7 specifies `min-width: 0` on the input. The code uses `min-width: 44px`, with a comment saying it is small enough to still shrink at 320 px. This is functionally safe by my reasoning (the flex basis is 0 and the minimum is 44 px, far below the 214 px or so available) and arguably better for the 44 px target rule, but it is a silent deviation from an "authoritative" document. Layout is **unverified**.
- Recommended fix: keep it, and have the Orchestrator record the deviation (or amend the architecture note). Verification should confirm the input stays on the same line as Add and that `scrollWidth <= clientWidth` at 320 px.

### CR-5 (Low): some tests pass vacuously or are weaker than their names

- Location: `test/todo-logic.test.js`.
  - `:293-312` "result is never already present in the list (uniqueness defence)": the assertion holds without the `while` loop (the loop is unreachable, CR-1), so it neither exercises nor protects it. The 15-digit boundary lists that would fail today are not included.
  - `:664-671` "extra fields are not copied": `__proto__: { polluted: 1 }` inside an object literal sets the prototype, which `JSON.stringify` omits, so the `polluted` assertion is vacuous there. The next test (`:673-679`, raw JSON text with an own `__proto__` key) is the real check and is fine.
  - `:1511-1523` layout tests (`test/` contains exactly one file; no root `package.json`) turn the policy into a failing test. They would also fail if the approved contingency OD-3 (add a minimal `package.json`) or a second real test file were ever needed. Acceptable, but should be known.
  - No test for CR-3 (outcome leakage), no multi-repair test at the 15-digit boundary (CR-1), and no test of `restore` performance (CR-2).
- Overall the suite is meaningful: spy-based save counts, zero-write constructor tests, throwing and flaky storage, frozen-input immutability, cross-realm `vm` checks that assert the lint patterns catch bad samples. Apart from the points above I found nothing tautological.
- Recommended fix: add the tests listed in CR-1, CR-2 and CR-3, and replace the literal `__proto__` case with a raw-JSON one (or delete it).

### CR-6 (Low): source-lint blind spots (the stripper limit and missing sinks)

- Location: `test/todo-logic.test.js:1371-1401`, `:1406-1423`, `:1436-1444`.
- Description:
  - `stripComments` does not parse regex literals; the implementer notes this. It is safe today because the one regex literal (`/^t[0-9]{1,15}$/`, `todo-logic.js:20`) holds no quote or slash pair, but any future regex containing a quote or `//` would mis-strip silently. The "stripped source is still substantial" test (`:1471-1474`) would not catch partial mis-stripping.
  - The sink scan runs on the raw source (comments included), which can only cause false failures, not vacuous passes. Fine.
  - Sinks not covered: `document.writeln`, `new Function(...)`, string-argument `setTimeout`/`setInterval`, `DOMParser`, `createContextualFragment`, `srcdoc`. None is present now.
  - No lint covers `styles.css` for the mandatory 4.7 rules. A regression (removing `[hidden]`, adding `100vw` or `overflow-x`, dropping `position: relative` on `.task-main`) would pass `node --test`.
- Recommended fix (optional, low cost): add a few more sink patterns, and a small CSS lint (has `[hidden]`, has `.task-main` with `position: relative` and `isolation: isolate`, no `100vw`, no `overflow-x`, `#task-error` has no `display: none`). Document the regex-literal limit in the stripper comment (it is already there) and keep regexes quote-free.

### CR-7 (Low, unverified): accessibility and focus details that need browser or screen reader confirmation

- Location: `app.js:126-140`, `styles.css:72-90`, `styles.css:120-124`.
- Description (none confirmed, all browser or AT dependent):
  - Re-announce trick: `setTimeout(..., 0)` may run before the next rendering update, so the clear and the set may be coalesced and the repeated identical message may still not be re-announced. The architecture marks this as optional and an accepted risk (R-6), so no defect.
  - `list-style: none` on `#task-list` removes list semantics in Safari and VoiceOver unless `role="list"` is set. Cosmetic for AT users; not an AC failure.
  - Add button: `color: #fff; background: #0b57d0; border: 2px solid #0b57d0` with only the native focus ring. The native ring may have weak contrast against a blue button in some browsers. Delete (red border, white fill) and the input keep native rings. AC-13 requires a visible indicator on each control.
  - Programmatic focus restoration after a mouse toggle or delete: whether `:focus-visible` matches (and so whether the row ring is drawn) is browser heuristic dependent.
- Recommended fix: verify in a browser. Optionally add `role="list"` to the `<ul>` and an explicit `:focus-visible { outline: 2px solid; outline-offset: 2px }` for `button` and `#task-input`.

### CR-8 (Low): small clarity and robustness items in `app.js` and `styles.css`

- Location and description:
  - `app.js:111` `list.replaceChildren.apply(list, rows)` passes one argument per task; engines cap argument counts (JavaScriptCore at roughly 65,000, V8 around 120,000), so a hand-seeded list that large could throw a `RangeError` in `render`. Building a `DocumentFragment` in a loop, or `list.textContent = ""` plus `appendChild`, avoids that. Practical risk is very low (it needs tens of thousands of stored tasks).
  - `app.js:148-158`: `render(controller.getTasks())` also runs on a blank submit, where nothing changed. Harmless but needless DOM churn.
  - Redundant checks: `app.js:168` (`target.classList` guard), `app.js:191` (`list.contains(button)` is implied by the `parentNode` check), `app.js:156` (`outcome.focus === "input"` is always true). `styles.css:155-156` (`.task-check` `min-width`/`min-height` duplicate the `.task-main` minimum), `styles.css:187` (`word-break: break-word` is deprecated and redundant beside `overflow-wrap: anywhere`; architecture lists it, so keep if desired).
  - No logic is duplicated between files; `app.js` holds no business rules.
- Recommended fix: optional tidy-ups only.

### CR-9 (Info): `createStore` and `createController` can throw on hostile arguments

- Location: `todo-logic.js:263-264`, `:296`.
- Description: a `createStore` options object whose `storage` property getter throws, or an injected `store.load` that throws, makes `createStore`/`createController` throw (probed). The architecture's "never throw" promise covers `load`, `save`, `restore` and `resolveStorage`, which hold. No app path produces these inputs, because `app.js` passes the result of `resolveStorage`. Mentioned for completeness only.
- Recommended fix: none needed.

### CR-10 (Info): behaviour recorded as accepted, not defects

- The text of a task cannot be selected or copied with the mouse or touch (full-row input; DR-1, R-14).
- Held Enter on Delete can delete several rows (R-11); double submit after a successful add shows the blank message (R-12).
- Before JavaScript runs, and with JavaScript disabled, the static empty-state text is visible next to the `<noscript>` message. Acceptable under FR-11.
- `createMemoryStorage` ships in the browser API as a test double, as approved (arch 4.1). Nothing found that exceeds the approved scope.

### CR-11 (Info): items for the Verification stage

Browser-only checks the code review cannot settle: layout and no horizontal scroll at 320/375/768/1280 px with a long unbroken string; 44 px rects of input, Add, checkbox input and Delete; no overlap of sibling controls; one toggle per click on text, box and empty row area; the checkbox input is the click target above the box and text; double-click Delete removes one row; live region present and zero height when idle; focus ring on `.task-main`; `file://` load with only three subresources; clear `todoApp.tasks` before each scenario and record browser and origin type (arch 8.2).

## 4. Dependency and security review

- Dependencies: none shipped. No `package.json`, no `node_modules`, no network URL in any shipped file (lint plus a manual read). Test file uses only `node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:vm`. No audit tool applies.
- Secrets: none in the reviewed files.
- Injection and unsafe sinks: none. User text reaches the DOM only via `textContent` and `setAttribute("aria-label", ...)`; ids via `dataset`. Stored data is rebuilt into fresh three-field objects; ids are pattern-validated.
- File and process handling: test file reads only repository files by fixed relative paths; no process spawning.
- Unchanged after the fix round: the fixes add no dependency, no I/O, no new global and no new sink.

## 5. Resolutions

Resolution round recorded after the user's decisions. Status values: Fixed (change made and independently re-verified), Accepted deviation, Accepted (no change), Info (nothing to do). Line numbers in the Resolution column refer to the current files.

| Id | Severity | Status | Resolution (who, what, evidence) |
|---|---|---|---|
| CR-1 | Medium | Fixed | Implementer changed `nextId` (`todo-logic.js:41-67`) to add every string id to `seen`, and `restore` (`:207-241`) to keep a `taken` set of every string id of kept items plus assigned ids. Re-verified by probe: `addTask` twice from `[t999999999999999]` gives `t999999999999999,t1000000000000000,t1000000000000001`; `restore` of one 15-digit id plus two id-less items gives the same three distinct ids. The loop body is now reachable and tests execute it (`test:318-340`, `:799-836`). |
| CR-2 | Medium | Fixed | `restore` pass 2 now uses one running counter and the `taken` set, so it is linear. Re-verified: 200,000 id-less items restored in 185 ms with 200,000 unique ids (the original defect took about 38 s for 20,000). Regression test `test:838-856` (20,000 items, 5 s bound). |
| CR-3 | Low | Fixed | `controller.add` (`todo-logic.js:327-343`) returns a new outcome object with `task` and `tasks` copied (non-object entries pass through). Re-verified: pushing to `o.tasks` and editing `o.task.text` left `getTasks()` unchanged; a blank add also returns copies. Tests at `test:1197-1244`. |
| CR-4 | Low | Accepted deviation | Input `min-width: 44px` (`styles.css:53-57`) instead of architecture 4.7 `min-width: 0`. Accepted by the user and recorded here. Functionally safe by reasoning; layout still **unverified** (Verification to check the input stays on the Add line and there is no horizontal scroll at 320 px). |
| CR-5 | Low | Fixed | Loop-executing `nextId` tests, 15-digit `add` and `restore` tests, the performance test, `add` copy tests and a raw-JSON own-`__proto__` test (`test:715-739`) were added. Layout tests now accept a `package.json` with type commonjs and no dependencies and fail on type module or dependencies (`test:1688-1744`). Mutation check on a scratch copy outside the repository: reverting `seen.add` to pattern-only failed 5 tests, making `taken` ignore rejected ids failed 1, returning the raw `add` outcome failed 3. The new tests are not tautological. |
| CR-6 | Low | Accepted | Lint blind spots and missing CSS lint left as is; no change made. For Verification or later. |
| CR-7 | Low | Accepted (unverified) | Accessibility and focus details need a browser or screen reader. `app.js`, `index.html` and `styles.css` not changed in this round. Left for Verification. |
| CR-8 | Low | Accepted | Optional tidy-ups in `app.js` and `styles.css` not applied; no behaviour impact at realistic sizes. |
| CR-9 | Info | Info | No action needed. |
| CR-10 | Info | Info | Approved behaviour, recorded only. |
| CR-11 | Info | Info | Carried to the Verification stage as a browser checklist. |

## 5a. Re-review after fixes

Scope: `todo-logic.js` and `test/todo-logic.test.js`. `git status` lists `app.js`, `index.html`, `styles.css` as untracked as before. They are not tracked in Git, so I could not diff them against an earlier state; "unchanged since T8" rests on the Orchestrator's report. Nothing in them depends on a changed code path: `app.js` reads only `ok`, `message`, `inputValue` and `focus` from the `add` outcome.

Observed in this round (read-only commands):
- `node --check todo-logic.js` exit 0; `node --check app.js` exit 0.
- `node --test` from the repo root: 249 tests, 31 suites, 249 pass, 0 fail, 0 cancelled, 0 skipped. There is no root `package.json`; `test/` holds only `todo-logic.test.js`.
- Probes against `require("./todo-logic.js")`:
  - `t1, missing, t1, t5` gives `t1,t6,t7,t5` (unchanged). `t1,t1,t2` gives `t1,t3,t2` (unchanged).
  - Boundary: `t999999999999999` plus two id-less items gives `t999999999999999,t1000000000000000,t1000000000000001`. Two sequential `addTask` calls give the same. A list holding both `t1000000000000000` and `t999999999999999` gives `t1000000000000001` on add.
  - `[t1000000000000000, t999999999999999, none, none]` gives `t1000000000000001,t999999999999999,t1000000000000002,t1000000000000003`: the 16-digit id is replaced as before and the counter skips it. `[t1, "t2x", "T2", none]` gives `t1,t2,t3,t4`. Ids `5` and `null` are replaced; `t0` and `t00` are kept.
  - `nextId([null, 5, "t3", {id:3}, {id:"t4"}])` gives `t5`.
  - A dropped item (blank text) does not enter `taken`: `[t2, {id:t3, text:""}, id-less]` gives `t2,t3`, which matches the existing "dropped items do not take part in id repair" test.
  - 200,000 id-less items: 185 ms, all ids unique.
  - Controller: edits to the returned `tasks` and `task` do not reach `getTasks()`; the outcome keys are unchanged (`ok,error,message,inputValue,focus,task,tasks`); a blank add returns an unchanged list copy.
- Mutation check on a scratch copy in a temporary directory outside the repository (deleted afterwards, no repository file touched): three single-line regressions each made tests fail (5, 1 and 3 failures), so the new tests protect the fixes.

Checks for new defects:
- `taken` including rejected ids: intentional and correct. It holds only string ids of items that survived text validation, so a stored 16-digit id is never handed out a second time. For lists whose ids are all valid it changes nothing, and all existing expected outputs (`t1,t6,t7,t5` and the rest of the restore suite) still pass.
- Ordering: repairs are still assigned in item order starting from the accepted maximum plus one. Unchanged for ordinary data.
- Counter precision: the largest accepted number has 15 digits, so the counter stays far below 2^53 and `"t" + counter` never switches to exponent form (that starts at 1e21).
- `add` copy: `copyTask` is applied only to objects and other entries pass through. `restore` returns only objects, so the pass-through branch is defensive and not covered by a test. The outcome shape is preserved (tested) and `app.js` is unaffected.
- Layout tests: now tolerate the approved OD-3 contingency (a minimal `package.json`), and the checker itself is tested with good and bad samples. The "exactly one file in `test/`" assertion stays and would fail if a second test file were added; this is deliberate policy, not a defect.
- Test meaningfulness: the older test "result is never already present" (`test:293-313`) is still weak on its own, but the new loop-executing tests (`:318-340`) cover what it could not. The 5 s performance bound is loose by design (about 185 ms observed at ten times the size) and the old quadratic code would fail it.

New findings: none at Medium or higher, none at Low. One cosmetic remark with no id: `nextId` and `restore` pass 2 each implement a small "skip taken numbers" loop. The duplication is minor; no action needed.

Still **unverified** (not run in a browser): rendering, 320 px layout, 44 px targets, focus rings, `file://` load, live region announcement, and the browser-only AC items listed in section 2.

Final verdict: **Approved.** CR-1, CR-2, CR-3 and CR-5 are fixed and independently confirmed. CR-4 is a recorded deviation. CR-6 to CR-8 are accepted with no change. CR-9 to CR-11 are informational. No blocker, high or medium finding remains open. Next stage is Verification, which must cover the browser-only checks (CR-11, CR-7, and the CR-4 layout item).

## 6. Open questions

None. Scope change: none. Optional follow-up for the Orchestrator: architecture 4.4 still says the 16-digit rollover is "harmless"; a one-line amendment would keep the document accurate now that uniqueness is enforced.
