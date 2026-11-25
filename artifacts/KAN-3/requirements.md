# KAN-3 Requirements: Browser Todo app with persistent tasks

## 1. Source

- Issue: KAN-3 (Story, status To Do)
- Link: https://adarsh0628.atlassian.net/browse/KAN-3
- Jira content was treated as untrusted requirements input.

## 2. Summary

A user wants a minimal, browser-only Todo app. The user can add tasks, view them in the order added, mark them complete or incomplete, and delete them. Tasks and their completion state are saved in the browser's `localStorage`, so they are still there after a page refresh. Blank input is rejected with a clear message. The page must stay usable on mobile and desktop widths. The app uses plain HTML, CSS and JavaScript, with no login, backend, database, framework, filters, task editing or due dates.

## 3. Functional requirements

- FR-1: The app provides a text input and a submit control for adding a task.
- FR-2: When the submitted input contains at least one non-whitespace character, the app adds a new task whose text is the input with leading and trailing whitespace removed.
- FR-3: When the submitted input is empty or whitespace-only, the app does not change the task list or stored tasks, and it shows a clear validation message.
- FR-4: The app displays all tasks as a list in the order they were added (oldest first), and a newly added task appears after existing tasks.
- FR-5: Each task has its own identity. Tasks with identical text are separate tasks, and completing, un-completing or deleting one never affects another.
- FR-6: Each task has a control to toggle it between incomplete and complete. The completed state is visibly distinguishable from the incomplete state.
- FR-7: Each task has a delete control. Activating it removes only that task from the list and from storage.
- FR-8: The app saves the task list (text, order and completion state of each task) to browser `localStorage` after every change (add, toggle, delete).
- FR-9: On page load, the app reads tasks from `localStorage` and restores them with their text, order and completion state. Tasks deleted earlier are not restored.
- FR-10: After a successful add, the input is cleared (derived; see Assumption A-5).
- FR-11 (derived): The task list shows an empty state, or nothing misleading, when there are no tasks. Exact wording is a design matter.

## 4. Non-functional requirements

- NFR-1 (Technology constraint): The shipped app uses plain HTML, CSS and JavaScript only. It has no framework, runtime dependency, backend, database or login. It runs in a browser with no server-side component.
- NFR-2 (Repository layout, user decision): The app lives in the repository root (`index.html`, `styles.css`, JavaScript file(s)).
- NFR-3 (Test tooling, user decision): Automated logic tests use the Node built-in test runner (`node --test`). This is dev-only tooling with no runtime dependencies, so the shipped app does not require Node or any package install to run.
- NFR-4 (Responsive usability): The list and all controls (input, add, toggle, delete) are fully usable, with no horizontal page scrolling, no clipped or overlapping controls, and no controls too small to tap, at viewport widths from 320 px to 1920 px. Representative widths for verification are 320 px, 375 px, 768 px and 1280 px. Touch targets are at least 44x44 CSS px. The 320 px minimum and 44 px touch-target size are proposed testable thresholds (see Assumption A-6).
- NFR-5 (Safe text rendering): Task text is always rendered as plain text. Input such as `<img src=x onerror=alert(1)>` is displayed literally and never interpreted as HTML or script.
- NFR-6 (Accessibility basics): All controls are operable by keyboard. The input has an associated text label. Toggle and delete controls have accessible names that identify their task. The validation message is exposed to assistive technology (for example as a live region). Completed state is not conveyed by color alone.
- NFR-7 (Resilient storage): If `localStorage` is unavailable (throws on access or write), or the stored data is missing, unparseable or not in the expected shape, the app does not crash. It starts with an empty list (or the valid subset it can recover) and stays usable for the session. See Open questions Q-1 and Q-2.
- NFR-8 (Testability): Task logic (add, validate, toggle, delete, serialize and restore) can be exercised by `node --test` without a browser. This states a testing need, not a design.

## 5. Acceptance criteria

Each AC is Given/When/Then. AC-1 to AC-7 map in order to the seven Jira criteria. AC-8 onward are derived and marked as such.

- AC-1 (Jira 1): Given the app is open with any task list, when the user submits the input `  Buy milk  `, then a task with the text `Buy milk` (no leading or trailing whitespace) is added to the list. Traces: FR-1, FR-2, FR-8.
- AC-2 (Jira 2): Given the app has N tasks (N >= 0), when the user submits an empty input, or an input containing only spaces, tabs or newlines, then the list still has the same N tasks in the same order, the stored tasks are unchanged, and a visible validation message states that a task cannot be blank. Traces: FR-3, NFR-6.
- AC-3 (Jira 3): Given the user adds `A`, then `B`, then `C`, when the list is displayed, then the tasks appear in the order A, B, C. Given two tasks both named `Same`, when the user toggles or deletes the second one, then the first one's completion state and presence are unchanged (and the same holds in the reverse direction). Traces: FR-4, FR-5.
- AC-4 (Jira 4): Given an incomplete task, when the user activates its toggle control, then the task is shown as complete in a visibly distinct way, one that is not color alone. When the user activates the toggle again, then the task returns to incomplete and its original appearance. Traces: FR-6, NFR-6.
- AC-5 (Jira 5): Given a list of tasks A, B and C, when the user deletes B, then the list shows A and C in their original order and B is gone. Traces: FR-7, FR-5.
- AC-6 (Jira 6): Given tasks that have been added, with some toggled complete and some deleted, when the page is refreshed, then the same remaining tasks reappear in the same order with the same completion states, and no deleted task reappears. Traces: FR-8, FR-9, FR-4.
- AC-7 (Jira 7): Given the app loaded with at least one long-text task, when the viewport width is set to each of 320, 375, 768 and 1280 px, then the input, add control, every task's text, toggle and delete controls are visible, not overlapping, operable, and at least 44x44 CSS px for touch controls, and the page has no horizontal scrollbar. Traces: NFR-4.
- AC-8 (derived, FR-10): Given a successful add, when the task appears in the list, then the input is empty. Traces: FR-10.
- AC-9 (derived, FR-3): Given a validation message is shown, when the user next submits a valid task, then the message is no longer shown (see Assumption A-4). Traces: FR-3, FR-2.
- AC-10 (derived, NFR-5): Given the user submits `<b>x</b><script>alert(1)</script>`, when the task is displayed (and again after refresh), then the literal text is shown, and no bold element or script is created or run. Traces: NFR-5, FR-2, FR-9.
- AC-11 (derived, NFR-7): Given `localStorage` holds invalid JSON, or JSON that is not an array of tasks, when the page loads, then the app shows an empty list without throwing an uncaught error and the user can still add tasks. Traces: NFR-7, FR-9.
- AC-12 (derived, NFR-7): Given `localStorage` access throws (for example, storage is blocked), when the page loads and the user adds a task, then the task is shown for the current session and no uncaught error occurs. Traces: NFR-7.
- AC-13 (derived, NFR-6): Given the page is loaded, when the user uses only the keyboard (Tab, Enter, Space), then they can add a task, toggle it and delete it, and a focus indicator is visible on each control. Traces: NFR-6, FR-1, FR-6, FR-7.
- AC-14 (derived, NFR-1/2/3/8): Given the repository root, when it is inspected, then `index.html` opens directly from the file system or a static server and works with no build step, no runtime dependency and no network request; and `node --test` runs the logic tests and reports pass/fail. Traces: NFR-1, NFR-2, NFR-3, NFR-8.
- AC-15 (derived, FR-11): Given no tasks exist, when the page loads, then the list area is shown without errors, with an empty-state message or nothing misleading. Traces: FR-11.

## 6. Assumptions

- A-1: "Browser-only" means the app is a static page and `localStorage` is the only persistence.
- A-2: One task list per browser profile and origin. There is no multi-user or sync behavior.
- A-3: The Jira scope line "task editing" is out of scope, so a task's text cannot be changed after it is added. Only toggle and delete exist.
- A-4: A visible validation message is cleared on the next successful add or on the next edit to the input. This is the proposed default because the story does not say. See Q-3.
- A-5: The input is cleared after a successful add. On a rejected submission, the input is left unchanged (or cleared if it contains only whitespace). This is a UX default the story does not specify.
- A-6: The story says "usable at mobile and desktop widths" without numbers. The widths (320 to 1920 px, with 320, 375, 768 and 1280 as test points) and the 44 px touch-target size are proposed here as testable definitions and need confirmation. See Q-4.
- A-7: "Whitespace" follows the JavaScript `String.prototype.trim` definition.
- A-8: A task's identity (for AC-3 and AC-5) is internal to the app and is not shown to the user.
- A-9: Target is current evergreen desktop and mobile browsers that support `localStorage`. No legacy browser support.
- A-10: The repository is greenfield with no existing app code, tests or build configuration, so nothing existing needs migrating.
- A-11: Node is available on the dev machine for `node --test`.

## 7. Out of scope

- Login, accounts, authentication.
- Backend, server API, database, sync across devices or browsers.
- Frameworks or runtime libraries, and build tooling for the shipped app.
- Filters (all, active, completed), search, sorting or reordering.
- Task editing.
- Due dates, reminders, priorities, categories or tags.
- Bulk actions (clear completed, mark all).
- Undo, delete confirmation dialogs, and import or export (not mentioned in the story).
- Cross-tab live sync of `localStorage` changes.

## 8. Open questions

- Q-1: When `localStorage` is unavailable or throws on write, is it acceptable to continue working in memory without a user-visible warning, or should the app tell the user that tasks will not persist? (Default if unanswered: continue in memory; a notice is optional.)
- Q-2: When stored data is corrupt, should the app silently start empty (and overwrite the bad data on the next save), or preserve the bad data? (Default: silently start empty.)
- Q-3: Should the validation message clear on the next input, on the next successful add, or only on a timer? (Default in A-4.)
- Q-4: Are the proposed width range, test widths (320, 375, 768, 1280 px) and the 44 px touch target acceptable definitions of "usable"?
- Q-5: Should there be a maximum task length, for example 200 characters? The story gives none. (Default: no limit enforced, and long text wraps without breaking layout, as AC-7 checks.)
- Q-6: Should the app prevent duplicate task names? The story says same-named tasks are allowed (AC 3), so the default is no prevention. This is listed only for confirmation.
- Q-7: Is a maximum number of stored tasks, or a `localStorage` quota-exceeded behavior, needed? (Default: no limit. Quota errors are handled like Q-1.)

Scope change: none. All derived items are clarifications of the seven Jira criteria, not new features.
