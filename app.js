/*
 * app.js
 * Thin DOM layer. Maps results from TodoLogic onto the page. It holds no
 * business rules and no state other than DOM references. Not required by
 * tests; exports nothing.
 */
(function () {
  "use strict";

  // Load guard: if the logic script did not load, show a static message.
  if (typeof globalThis.TodoLogic === "undefined") {
    var main = document.querySelector("main");
    if (main) {
      main.textContent = "The app could not load. Reload the page.";
    }
    return;
  }

  var logic = globalThis.TodoLogic;

  var form = document.getElementById("add-form");
  var input = document.getElementById("task-input");
  var errorEl = document.getElementById("task-error");
  var list = document.getElementById("task-list");
  var emptyState = document.getElementById("empty-state");

  // Startup. resolveStorage owns the try/catch around the storage property.
  var storage = logic.resolveStorage(function () {
    return window.localStorage;
  });
  var store = logic.createStore({ storage: storage });
  var controller = logic.createController({ store: store });

  // ---------------------------------------------------------------------
  // Row lookup: iterate children and compare dataset.id. No selector is
  // ever built from an id.
  // ---------------------------------------------------------------------

  function findRow(id) {
    var rows = list.children;
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].dataset.id === id) {
        return rows[i];
      }
    }
    return null;
  }

  function focusInRow(id, className) {
    var row = findRow(id);
    if (!row) {
      return false;
    }
    var target = row.querySelector("." + className);
    if (!target) {
      return false;
    }
    target.focus();
    return true;
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  function buildRow(task) {
    var li = document.createElement("li");
    li.dataset.id = task.id;

    var label = document.createElement("label");
    label.setAttribute("class", "task-main");

    var check = document.createElement("input");
    check.setAttribute("type", "checkbox");
    check.setAttribute("class", "task-check");
    check.checked = task.completed === true;

    var box = document.createElement("span");
    box.setAttribute("class", "task-box");
    box.setAttribute("aria-hidden", "true");

    var text = document.createElement("span");
    text.setAttribute("class", "task-text");
    text.textContent = task.text;

    label.appendChild(check);
    label.appendChild(box);
    label.appendChild(text);

    var del = document.createElement("button");
    del.setAttribute("type", "button");
    del.setAttribute("class", "task-delete");
    del.setAttribute("aria-label", "Delete: " + task.text);
    del.textContent = "Delete";

    li.appendChild(label);
    li.appendChild(del);
    return li;
  }

  function setHidden(element, hidden) {
    if (hidden) {
      element.setAttribute("hidden", "");
    } else {
      element.removeAttribute("hidden");
    }
  }

  function render(tasks) {
    var rows = tasks.map(buildRow);
    list.replaceChildren.apply(list, rows);
    var empty = tasks.length === 0;
    setHidden(emptyState, !empty);
    setHidden(list, empty);
  }

  // ---------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------

  function clearMessage() {
    errorEl.textContent = "";
    input.removeAttribute("aria-invalid");
  }

  function showMessage(message) {
    input.setAttribute("aria-invalid", "true");
    if (errorEl.textContent === message) {
      // Same text as before: clear, then set on the next tick so assistive
      // technology can announce it again.
      errorEl.textContent = "";
      setTimeout(function () {
        if (input.getAttribute("aria-invalid") === "true") {
          errorEl.textContent = message;
        }
      }, 0);
    } else {
      errorEl.textContent = message;
    }
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var outcome = controller.add(input.value);
    if (outcome.ok) {
      clearMessage();
    } else {
      showMessage(outcome.message);
    }
    input.value = outcome.inputValue;
    render(controller.getTasks());
    if (outcome.focus === "input") {
      input.focus();
    }
  });

  input.addEventListener("input", function () {
    clearMessage();
  });

  // Toggle: one delegated change listener, acting only on .task-check.
  list.addEventListener("change", function (event) {
    var target = event.target;
    if (!target || !target.classList || !target.classList.contains("task-check")) {
      return;
    }
    var row = target.closest("li");
    if (!row || row.parentNode !== list) {
      return;
    }
    var id = row.dataset.id;
    controller.toggle(id);
    render(controller.getTasks());
    focusInRow(id, "task-check");
  });

  // Delete: one delegated click listener, matched only on .task-delete.
  list.addEventListener("click", function (event) {
    if (event.detail > 1) {
      return;
    }
    var target = event.target;
    if (!target || typeof target.closest !== "function") {
      return;
    }
    var button = target.closest(".task-delete");
    if (!button || !list.contains(button)) {
      return;
    }
    var row = button.closest("li");
    if (!row || row.parentNode !== list) {
      return;
    }
    var result = controller.remove(row.dataset.id);
    render(controller.getTasks());
    if (!result.changed) {
      return;
    }
    if (result.focus && result.focus.kind === "task") {
      if (!focusInRow(result.focus.id, "task-delete")) {
        input.focus();
      }
    } else {
      input.focus();
    }
  });

  render(controller.getTasks());
})();
