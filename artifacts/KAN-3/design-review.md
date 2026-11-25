# KAN-3 Design Review

Reviewed: `artifacts/KAN-3/architecture.md` (v1) against `artifacts/KAN-3/requirements.md` (approved), with the user-approved Q-1..Q-7 defaults and OD-1..OD-6 defaults, Node v26.13.1 on the dev machine.

Method: document review only. Nothing was executed or run in a browser. Statements about browser or Node behaviour below are from knowledge of the specs, not observed here. Anything I am not certain of is marked "verify".

## 1. Verdict

The overall approach holds. Classic deferred scripts, a UMD logic file, injected storage, `textContent` rendering and a thin controller all satisfy the requirements. I found no Scope change.

There are three defects that would cause real failures if the plan is implemented as written (DR-1, DR-2, DR-3). Four more gaps weaken verification or accessibility (DR-4 to DR-7). The rest are low-severity clarifications.

The central weakness is that the design says the DOM layer has "no decisions" and is "too thin to need a Node test". It actually contains most of the AC-4, 7, 8, 9, 13 and 15 behaviour, and no browser tooling is configured. Those ACs may end up unverifiable (DR-4).

Severity scale: High = would break an AC or requirement as designed. Medium = likely defect or an unverifiable AC. Low = clarification or hardening.

## 2. Findings

### High

**DR-1 (gap, High): The checkbox overlay pattern omits the containing block and stacking rules, so the invisible input can cover the page or the Delete button.**
- Section 4.7 positions the checkbox `inset: 0; width/height: 100%; opacity: 0` "over the whole `.task-main` label". It never says `.task-main { position: relative }`. Without that, the nearest positioned ancestor is the initial containing block. The transparent input would then stretch over the viewport and intercept every click, including Delete and the text field. No row and no control would work.
- Stacking is also unspecified. If `.task-box` (the drawn box) is made `position: relative` to draw the tick, it paints above the input because it is later in DOM order. Clicks on the 24 px box then hit the span, not the input.
- That produces the label-forwarded double click described in DR-2.
- Because the input has `opacity: 0`, its native focus outline is invisible too. The ring has to be drawn elsewhere, which DR-6 covers.
- Side effects of a full-row invisible input:
  - Task text cannot be selected or copied with the mouse or touch.
  - In forced-colors mode, a tick drawn with background colors can disappear.
- Recommended changes (for Orchestrator to confirm as an agreed decision):
  - Require `.task-main { position: relative }` explicitly.
  - Keep `.task-box` and `.task-text` non-positioned so the input always receives the pointer. If `.task-box` must be positioned, give the input a higher `z-index`, and say so in the plan.
  - Draw the tick with a text glyph or borders, which forced-colors mode keeps, and use `outline`, not `box-shadow`, for the focus ring.
  - Record the "text not selectable" trade-off as accepted.
  - Add an AC-7 verification step that no control's rect overlaps a sibling. The ancestor label and its own input are excluded from that check by definition.

**DR-2 (inconsistency, High): The delegated `click` handler is under-specified and can double-toggle.**
- Section 4.2 says one delegated `click` on the `<ul>` "handles the toggle checkbox and the delete button". It does not say which element the handler matches.
- A click on a `<label>` (anywhere the input does not cover) dispatches two click events. The first targets the label. The second is a synthetic click on the input. Both bubble to the `<ul>`.
- A handler that matches `closest("li")` or `.task-main` toggles twice, so the task ends in its original state and nothing visibly happens.
- The re-render during the first event also replaces the input before the second event fires.
- The design says the pointer normally lands on the input. DR-1 shows that depends on unstated CSS.
- Recommended changes (for Orchestrator to confirm as an agreed decision):
  - Specify the toggle handler as delegated `change` on `.task-check`. One user action then produces exactly one `change` event, for pointer, touch, label click and Space alike.
  - Alternatively, match only when `event.target` is the `input.task-check` element itself.
  - Handle delete only when `event.target.closest(".task-delete")` matches. A row-level `closest("li")` match must never decide the action.
  - Add a browser verification step: click on the text, on the drawn box, and on the row's empty area. Each must toggle exactly once.

**DR-3 (risk, High): Restored ids are an unrestricted string, but focus restoration looks them up by `data-id`. A hand-edited id can break the page.**
- Rule 5 of the restore rules accepts any non-empty string id. Section 4.6 re-focuses "found by `data-id`".
- If the lookup is `querySelector('[data-id="' + id + '"]')`, an id such as `a"]` throws a `SyntaxError`. That is an uncaught exception on a path that runs after every toggle, which breaks NFR-7 and AC-11's "no uncaught error".
- Setting the attribute with `setAttribute` is injection-safe. Building a selector string from it is not.
- Even without a selector, a plain-object lookup such as `seen[id]` misbehaves for ids like `constructor` or `__proto__`.
- The claim in 4.4 that ids are unique "by construction" holds only if every id matches `t<number>`. Restore does not enforce that.
- Recommended changes (for Orchestrator to confirm as an agreed decision):
  - `restore` accepts an id only if it matches `^t[0-9]+$` and is unique. Anything else gets a fresh id. This removes selector, prototype-key and weird-string cases in one rule. It also makes the uniqueness claim true.
  - Forbid selector construction from ids. The DOM layer finds rows by iterating `ul.children` and comparing `dataset.id`, or uses `CSS.escape`. Duplicate detection uses a `Set`.
  - Add Node cases for `id: 'a"]'`, `"__proto__"`, `"constructor"`, `""` and numeric ids.

### Medium

**DR-4 (gap, Medium): DOM-layer behaviour is claimed to be "thin" but carries the logic of many ACs, and none of it is Node-testable. Browser tooling is unconfigured.**
- Section 1.3 says the DOM layer has "no decisions". Section 4 gives it all of these:
  - Message clearing timing (A-4).
  - `aria-invalid` handling.
  - Whitespace-only input clearing (A-5).
  - Computing the post-delete focus target (next, else previous, else input). This needs the pre-render DOM, which contradicts "holds no state beyond DOM references".
  - The empty-state toggle.
  - Storage-backend resolution with `try/catch` around `window.localStorage` (the actual AC-12 failure path).
- The AC matrix has "n/a" or a browser-only check for AC-4 (visual), AC-7, AC-8 (UI half), AC-9, AC-13 and AC-15 (UI half).
- `.mcp.json` has no browser tooling, and OD-1 defaults to ad hoc tooling or a manual checklist. The honest outcome may be that several ACs are "unverified".
- The AC matrix says Node proves "the UI clears the input" for AC-8. It proves only that `add` returned ok.
- Two logic-file seams are also never exercised:
  - The UMD browser branch (the global attach) that the `file://` story relies on. The only Node test uses `require`.
  - The "static check that `todo-logic.js` has no browser globals at load". It is not defined, and a grep for `window` or `document` would false-positive on comments.
- Node v26 is recent. It defines some web-like globals (`navigator`; Web Storage in newer releases; verify). A passing `require` therefore does not prove the file avoids browser globals.
- Recommended changes (for Orchestrator to confirm as an agreed decision):
  1. Move the decisions into pure functions in `todo-logic.js`, with the DOM layer reduced to mapping their results:
     - A submit outcome: `{ ok, error, message, inputValue, focus: "input" }`.
     - A focus planner: `focusAfterDelete(tasksBefore, id) -> { kind: "task" | "input", id }`.
     - `resolveStorage(getter)`, which wraps the `try/catch` around the property read and returns a storage-like object or `null`.
  2. Add a `vm`-based Node test. Run `todo-logic.js` in an empty `vm` context with no `module` or `require`, and assert that `TodoLogic` appears on the context global with the expected API. This covers the UMD browser branch and proves no load-time browser-global use.
  3. Add a Node source-lint test using `node:fs` that reads `app.js` and `todo-logic.js` and asserts all of these:
     - No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` or `eval`.
     - No `http://`, `https://` or protocol-relative URLs. Match `https?://` and `//[a-z]`, not bare `//`, which also hits comments.
     - No `import` or `export` keywords.
  4. Keep OD-1. Add to the plan that any AC verified only by a manual checklist or ad hoc tooling is reported with that qualifier, and that unverified ACs are listed explicitly.
- Items 1 to 3 add no dependency and do not exceed NFR-3 or NFR-8.

**DR-5 (inconsistency, Medium): Submit handling does not specify `preventDefault` or ordering.**
- `<form id="add-form" novalidate>` has no `action` or `method`. If the handler throws before `preventDefault()`, for example when `TodoLogic` is missing or another bug, the page navigates to `index.html?task=...` and reloads. The typed text ends up in the URL.
- Section 4.2 does not say `preventDefault()` is the first statement.
- Recommended change (for Orchestrator to confirm as an agreed decision): call `event.preventDefault()` as the very first statement of the submit handler, before any other logic.

**DR-6 (inconsistency, Medium): The focus-ring recipe cannot be built as written, and the live-region rationale is contradicted.**
- **Focus ring.** Section 4.7 draws the ring "on `.task-main` via `:focus-within`/`:focus-visible` on the sibling".
  - `:focus-within` also matches after a mouse click, so the ring shows on pointer use and not only on keyboard use.
  - A sibling selector (`.task-check:focus-visible ~ .task-box`) can style `.task-box`, but cannot style the parent `.task-main`.
  - A ring on the parent needs `.task-main:has(.task-check:focus-visible)`. `:has()` is fine under A-9's evergreen scope (verify browser versions in the verification stage).
  - AC-13's "focus indicator visible on each control" cannot be checked from the input's computed outline, because the input is `opacity: 0`.
- **Live region.** Section 4.6 argues a permanent live region is more reliably announced than one "inserted or unhidden". It then specifies `#task-error:empty { display: none }`. An element at `display: none` is not in the accessibility tree, so setting `textContent` is exactly an unhide.
  - `role="alert"` is more tolerant than other live regions, but this contradicts the stated rationale.
- **Repeated message.** Setting the same text again may not be re-announced (accepted as R-6). A cheap mitigation is to clear the region, then set the text on the next frame.
- Recommended changes (for Orchestrator to confirm as an agreed decision):
  - Specify `.task-main:has(.task-check:focus-visible)` for the row ring, or draw the ring on `.task-box` via sibling selector.
  - Keep the live region rendered when idle: collapse it with zero height and margin, not `display: none`.
  - Optionally clear the region, then set the message on the next frame (`requestAnimationFrame` or `setTimeout 0`), so a repeated blank submit re-announces.
  - State in the AC-13 verification that the ring is checked on the drawn element, not on the input.

**DR-7 (risk, Medium): A full re-render after every action creates data-loss and keyboard-repeat hazards that the design does not note.**
- **Double-click or double-tap Delete.** The first click deletes row N. The list is rebuilt, and row N+1 moves under the pointer. The second click of the same gesture deletes that row too. There is no undo or confirm (both out of scope), so this is silent loss of an unrequested task. On touch, a double-tap is likely unless `touch-action: manipulation` is set.
- **Keyboard auto-repeat.** Holding Enter on a Delete button fires repeated activations. The design moves focus to the next row's Delete button after each delete, so a held key can delete the whole list.
- **Double submit.** After a successful add, the input is empty. A second Enter or a double-tap on Add submits blank and shows "Task cannot be blank". The behaviour conforms to FR-3, but it is a likely nuisance.
- **Focus on touch.** Programmatically focusing the input after Add and after deleting the last task will open the virtual keyboard on touch devices.
- Recommended changes (for Orchestrator to confirm as an agreed decision):
  - Set `touch-action: manipulation` on the buttons.
  - Ignore delete clicks with `event.detail > 1`. This suppresses a double-click on the same position. Keyboard activation has `detail === 0` and is unaffected.
  - Record the held-Enter hazard as a known accepted limitation, or avoid auto-focusing the next Delete after a keyboard delete. For example, focus the list item or the input instead.
  - Note the double-submit message as accepted behaviour.

### Low

**DR-8 (risk, Low): Id arithmetic edge cases and restore ordering.**
- `nextId` parses `\d+` with `Number`. With hand-edited ids beyond 2^53, `max + 1` can equal an existing id or lose precision, so "unique by construction" is false for them.
  - DR-3's `^t[0-9]+$` rule on its own does not fix this. Limit the digits to at most 15, or loop until the candidate is not in the set.
- Restore assigns fresh ids in a single pass. An item with a missing id receives `nextId` of the ids accepted so far, so a later item with a valid id such as `t1` can then be flagged as a duplicate and renumbered.
  - Uniqueness still holds, but the result depends on item order and the test expectations are ambiguous.
- Recommended change (for Orchestrator to confirm as an agreed decision): do restore in two passes. First collect the valid unique ids and keep them. Then assign fresh ids to the remaining items, with `nextId` run over the full kept set. Specify the expected outputs in the plan so the Node tests are deterministic.
- Reuse of an id after deleting the highest (4.4, R-10): I agree this is harmless. The DOM is rebuilt from state, ids are not displayed, and a focus lookup by id acts on the current DOM. It would matter only if a stale reference survived re-render, which the design excludes.

**DR-9 (gap, Low): The UMD wrapper and script scoping need explicit rules.**
- Classic scripts share one global lexical scope. A top-level `const`, `let` or `function` in `todo-logic.js` and in `app.js` with the same name throws a redeclaration `SyntaxError` and kills `app.js`. A top-level `const TodoLogic` would also not attach to `window`.
- Section 4.1 does not say the logic file body is wrapped in a function or states how the global is attached.
- Recommended changes (for Orchestrator to confirm as an agreed decision):
  - Wrap both files in an IIFE with `"use strict"`. The only global is `TodoLogic`, assigned as `globalThis.TodoLogic = api`.
  - Make the wrapper test `typeof module === "object" && module.exports` first and otherwise use `globalThis`. It must not reference `window`, `self` or `document` unguarded.
  - DR-4 item 2 verifies this.
- On `defer` order: deferred classic external scripts run in document order after parsing and before `DOMContentLoaded`. The `file://` claim (no CORS for classic `<script src>`) is correct, provided no `crossorigin` attribute is added. Add "no `crossorigin` and no `type=module`" to the AC-14 inspection.
- Node project-type detection: "without a `package.json`, Node treats `.js` as CommonJS" is conditional on there being no ancestor `package.json` with `"type": "module"`.
  - I checked the repository and the parent `Copilot-Capstone` folder and found none. Directories above that were not checked.
  - The risk is low, and the test run will show it immediately. If it ever fails, the fix is a minimal `package.json` with `"type": "commonjs"`. That would reopen OD-3 and needs user confirmation.

**DR-10 (inconsistency, Low): AC-11's wording versus the stored envelope.**
- AC-11 says "JSON that is not an array of tasks" yields an empty list. The design's own canonical format is an object envelope `{version, tasks}`. That is "not an array", but it is loaded.
- A bare array is accepted. That actually matches the literal AC-11, so OD-6's "lenient" label is a misnomer. The envelope is the deviation.
- Recommended change (for Orchestrator to confirm as an agreed decision): state in the plan that AC-11's "expected shape" means the envelope or a bare array of tasks, and that anything else is empty. Make the verification seed values explicit, since a tester reading AC-11 literally might seed `{"version":1,"tasks":[...]}` and expect empty.

**DR-11 (inconsistency, Low): Kept text is not re-trimmed on restore.**
- Rule 3 requires `trim()` non-blank, but keeps the text as stored. A task stored as `"  x  "` therefore violates the invariant (FR-2) that task text is trimmed, which every in-app task satisfies.
- It does not break any AC, because FR-9 says tasks restore "with their text".
- Recommended change (for Orchestrator to confirm as an agreed decision): pick one and test it. Either keep as stored, as designed, or trim on restore. Trimming is slightly more consistent and costs one call.

**DR-12 (gap, Low): Dead or speculative parts of the storage design.**
- `createStore.save` mirrors every write into the memory fallback. The mirror is read only by `load()`, and `load()` runs once at startup, when the mirror is empty. The controller already holds the list. So the mirror is never read in the app.
- `isPersistent()` is exposed by store and controller but nothing consumes it. The user declined a notice (Q-1). `STORAGE_VERSION` is written but never validated. A pre-write version envelope supports a hypothetical migration.
- None of these has a requirement. They are small, but they are code with tests and with `isPersistent()` initial-state semantics left undefined.
- Recommended change (for Orchestrator to confirm as an agreed decision): drop the mirror and `isPersistent()`, or keep them as an explicit future hook and define the initial `isPersistent()` value. Keep `createMemoryStorage` as the test double. If `createMemoryStorage` is kept, use a `Map`, not a plain object.

**DR-13 (risk, Low): `localStorage` on `file://` and verification hygiene.**
- In Chromium, all `file://` pages commonly share one `localStorage` origin. Other browsers key by file path (verify per browser).
- The namespaced key `todoApp.tasks` helps with other apps, but two copies of this app (a worktree, the verification checkout, a copy on the Desktop) would share one list in Chromium.
- The data is treated as untrusted: restore rebuilds fresh objects and renders with `textContent`. That is the right posture, and no secrets are stored.
- Recommended change (for Orchestrator to confirm as an agreed decision): in the verification stage, clear `todoApp.tasks` before each scenario and record the browser and origin type (`file://` versus a static server) next to each AC result.

**DR-14 (gap, Low): Smaller specification gaps.**
- `[hidden]` pitfall: if `#empty-state` or the `<ul>` is toggled with the `hidden` attribute and CSS sets `display` on the same element, the author style overrides the UA `[hidden]` rule and the element stays visible. Add `[hidden] { display: none }` (with `!important`) to the CSS spec.
- Section 7 says a missing `TodoLogic` is "not specially handled", but the same row says `app.js` "must not throw an unhandled error". Pick one. The simplest is a guard on `typeof TodoLogic === "undefined"` that shows a static message in place of the app.
- The controller constructor must not call `save` (a "repair on load" write would break AC-2's zero-`setItem` assertion). State that in section 4.1.
- AC-14 counts "4 local assets" while section 2 lists five files, including `index.html`. Reword as "`index.html` plus three subresources".
- Whole-list overwrite means two open tabs lose each other's changes. The in-memory list is authoritative. This is accepted under R-3 and out of scope.
- A stored list with bad items is overwritten on the next save, so recovered-subset data loss is permanent. This is covered by the accepted Q-2 default.

## 3. Traceability

### 3.1 Requirements coverage
Every FR, NFR and AC has a design element and a verification method. The gaps are in strength of verification, not in coverage.

| Item | Design element | Verification | Gap |
|---|---|---|---|
| FR-1, FR-2, FR-3, FR-4, FR-5, FR-7, FR-8, FR-9 | Logic, controller, restore | Node (AC-1, 2, 3, 5, 6) | None |
| FR-6 / AC-4 | Checkbox, tick, line-through | Browser only | DR-1, DR-2, DR-6 |
| FR-10 / AC-8 | UI clears the input | Browser only. The Node column proves only the `add` result | DR-4 |
| FR-11 / AC-15 | Empty-state element | Node `restore(null)` plus browser | DR-14 (`[hidden]`) |
| AC-7, NFR-4 | Flex CSS, 44 px minimums | Browser measurement only | DR-1, DR-4. If no tooling is available, AC-7 is unverified |
| AC-9 | Input event and add | Browser only | DR-4 |
| AC-10, NFR-5 | `textContent`, `setAttribute` | Node round-trip plus browser | Add the source-lint test (DR-4) |
| AC-11, NFR-7 | `restore`, store | Node plus browser | DR-3, DR-10 |
| AC-12 | `try/catch` in `app.js`, store | Node covers the store, not the property-access `try/catch` | DR-4 |
| AC-13, NFR-6 | Native controls, focus rules | Browser only | DR-6, DR-7 |
| AC-14, NFR-1..3 | Static files, classic scripts, `node --test` | Inspection plus Node | DR-4 (UMD browser branch), DR-9 |
| NFR-8 | Logic, controller, injection | `node --test` | None |

### 3.2 Design elements with no requirement
These are small and not scope violations, but they are extras:
- `STORAGE_VERSION`, the version envelope, and `isPersistent()` (DR-12).
- The in-memory mirror (DR-12).
- `<noscript>` and the `data:,` favicon. Both are low-cost and harmless.
- The CSP discussion, and the "contrast 4.5:1" design goal. The latter is labelled as not required.

Nothing in the design adds features outside the approved scope (no filters, editing, due dates, sync, framework or build step).

## 4. Security and failure-mode review

| Area | Assessment |
|---|---|
| XSS and HTML injection | Sound as designed. `textContent` for text, `setAttribute` for `aria-label` and `data-id`. No string-built HTML. Add the source-lint test (DR-4) as a guard. |
| Attribute injection (`aria-label`, `data-id`) | Safe with `setAttribute` or `dataset`. The weak point is the selector built from `data-id` (DR-3), which is an availability bug, not XSS. |
| Prototype pollution via stored JSON | Mitigated. Fresh objects with three fields. Use a `Set`, not a plain object, for duplicate ids (DR-3). |
| CSP | The decision not to add a `<meta>` CSP is reasonable for `file://`. Safe rendering carries NFR-5. |
| Form submission | Unhandled-exception path navigates with the text in the URL (DR-5). |
| Storage | No secrets stored. `file://` storage may be shared with other pages (DR-13). Treated as untrusted input. |
| Failure modes | Blocked storage, throwing `getItem` or `setItem`, quota, corrupt JSON and missing storage are handled. Missing `TodoLogic` is inconsistent (DR-14). Selector throw on odd ids is unhandled (DR-3). |
| User-caused data loss | Double-click delete, held-key delete, and double submit (DR-7). |
| Performance | Full re-render and full-list serialize on every change are fine for realistic sizes. "No task limit" (Q-7) means very large lists are slow but not incorrect. Not a finding. |
| Dev environment | Node v26.13.1 satisfies the `node --test` requirement, so R-7 is resolved. No test or `package.json` file exists in the repository, and `node --test` default discovery picks up only `test/` and `*.test.js`-style names. The `.claude/hooks/*.mjs` files do not match those patterns. Any non-test helper placed in `test/` would be executed as a test file. |

## 5. Recommended changes (summary)
Each item below is "for Orchestrator to confirm as an agreed decision".

1. **DR-1.** `.task-main { position: relative }`. Keep the visible box non-positioned, or put the input above it. Draw the tick as a glyph or border. Use `outline` for the focus ring. Accept the text-not-selectable trade-off.
2. **DR-2.** Handle toggles with a delegated `change` on `.task-check` (or match `event.target` to the input). Match delete only on `.task-delete`.
3. **DR-3.** Restore accepts ids only as `^t[0-9]+$` and unique. No selector construction from ids. Use a `Set`. Add the odd-id Node tests.
4. **DR-4.** Move submit outcome, focus planner and `resolveStorage` into logic. Add a `vm` test of the UMD browser branch and a source-lint test. Report browser-only ACs as unverified if no tooling is available.
5. **DR-5.** `preventDefault()` first in the submit handler.
6. **DR-6.** Ring via `:has(:focus-visible)` or on the drawn box. Keep the live region rendered when idle. Optionally clear then set the message.
7. **DR-7.** `touch-action: manipulation`. Ignore delete clicks with `detail > 1`. Document the held-key limitation.
8. **DR-8.** Two-pass id repair. Cap id digits at 15 or loop until unique.
9. **DR-9.** IIFE plus `"use strict"` in both files. `globalThis` attach. Add the "no `crossorigin`, no `type=module`" inspection.
10. **DR-10 to DR-14.** Clarify AC-11's expected shape. Decide the restore trim rule. Drop the mirror and `isPersistent()` or define them. Clear storage per verification scenario. Apply the DR-14 specification fixes.

## 6. Open questions

- **OQ-1 (DR-4):** Is the Orchestrator willing to move the submit outcome, focus planner and `resolveStorage` into `todo-logic.js`? If not, the plan must state which ACs will be reported as browser-only or unverified when no browser tooling is available. (Related to OD-1.)
- **OQ-2 (DR-7):** Is the `detail > 1` delete guard acceptable, or should the held-key and double-click hazards be recorded as accepted limitations?
- **OQ-3 (DR-9):** If Node ever treats `todo-logic.js` as ESM (an ancestor `package.json` with `"type": "module"`), may a minimal `package.json` with `"type": "commonjs"` be added? That reopens OD-3, and no change is needed unless the problem occurs.
- **OQ-4 (DR-11, DR-12):** Keep or drop restore-time trimming, the memory mirror, `STORAGE_VERSION` and `isPersistent()`?

Scope change: none. All recommendations stay inside the approved requirements.
