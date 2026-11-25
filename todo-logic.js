/*
 * todo-logic.js
 * DOM-free Todo logic. One IIFE, strict mode, dual export:
 *   - Node (CommonJS):  module.exports = api
 *   - Browser script:   globalThis.TodoLogic = api
 * Holds constants, the pure list operations, the storage codec, the store
 * and the controller. Storage is always injected; nothing here touches the
 * page or any global storage object.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "todoApp.tasks";
  var STORAGE_VERSION = 1;

  var MESSAGES = {
    blank: "Task cannot be blank. Enter some text and try again."
  };

  var ID_PATTERN = /^t[0-9]{1,15}$/;

  function asList(tasks) {
    return Array.isArray(tasks) ? tasks : [];
  }

  // Trim per String.prototype.trim. Non-string input counts as blank.
  function validateText(raw) {
    if (typeof raw !== "string") {
      return { ok: false, error: "blank" };
    }
    var text = raw.trim();
    if (text === "") {
      return { ok: false, error: "blank" };
    }
    return { ok: true, text: text };
  }

  // Largest matching id number plus one; increments until unique.
  // Every string id in the list is remembered (not only pattern matches), so
  // an id such as a 16-digit "t1000000000000000" is never produced twice.
  function nextId(tasks) {
    var list = asList(tasks);
    var seen = new Set();
    var max = 0;
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (typeof item !== "object" || item === null) {
        continue;
      }
      var id = item.id;
      if (typeof id !== "string") {
        continue;
      }
      seen.add(id);
      if (ID_PATTERN.test(id)) {
        var n = Number(id.slice(1));
        if (n > max) {
          max = n;
        }
      }
    }
    var candidate = max + 1;
    while (seen.has("t" + candidate)) {
      candidate += 1;
    }
    return "t" + candidate;
  }

  function addTask(tasks, raw) {
    var list = asList(tasks);
    var checked = validateText(raw);
    if (!checked.ok) {
      return { tasks: list.slice(), task: null, error: "blank" };
    }
    var task = { id: nextId(list), text: checked.text, completed: false };
    return { tasks: list.concat([task]), task: task, error: null };
  }

  function toggleTask(tasks, id) {
    var list = asList(tasks);
    return list.map(function (task) {
      if (task && task.id === id) {
        return { id: task.id, text: task.text, completed: !task.completed };
      }
      return task;
    });
  }

  function deleteTask(tasks, id) {
    var list = asList(tasks);
    return list.filter(function (task) {
      return !(task && task.id === id);
    });
  }

  // Plan computed from the list as it was before the delete.
  function focusAfterDelete(tasksBefore, id) {
    var list = asList(tasksBefore);
    var index = -1;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].id === id) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      return { kind: "input" };
    }
    if (index + 1 < list.length) {
      return { kind: "task", id: list[index + 1].id };
    }
    if (index - 1 >= 0) {
      return { kind: "task", id: list[index - 1].id };
    }
    return { kind: "input" };
  }

  function submitOutcome(tasks, raw) {
    var result = addTask(tasks, raw);
    if (result.error === null) {
      return {
        ok: true,
        error: null,
        message: "",
        inputValue: "",
        focus: "input",
        task: result.task,
        tasks: result.tasks
      };
    }
    return {
      ok: false,
      error: "blank",
      message: MESSAGES.blank,
      inputValue: "",
      focus: "input",
      task: null,
      tasks: result.tasks
    };
  }

  // ---------------------------------------------------------------------
  // Codec: serialize and restore
  // ---------------------------------------------------------------------

  function copyTask(task) {
    return { id: task.id, text: task.text, completed: task.completed };
  }

  // Writes the envelope { version, tasks } with the three known fields only.
  function serialize(tasks) {
    var list = asList(tasks).filter(function (task) {
      return typeof task === "object" && task !== null;
    });
    return JSON.stringify({
      version: STORAGE_VERSION,
      tasks: list.map(copyTask)
    });
  }

  // Never throws. Bad input gives []. The version field is ignored.
  function restore(raw) {
    if (typeof raw !== "string" || raw === "") {
      return [];
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return [];
    }
    var items;
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray(parsed.tasks)
    ) {
      items = parsed.tasks;
    } else {
      return [];
    }

    // Keep valid items as fresh objects (id filled in below).
    var kept = [];
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      if (typeof item !== "object" || item === null) {
        continue;
      }
      var text = item.text;
      if (typeof text !== "string") {
        continue;
      }
      var trimmed = text.trim();
      if (trimmed === "") {
        continue;
      }
      kept.push({
        id: item.id,
        text: trimmed,
        completed: item.completed === true
      });
    }

    // Pass 1: accept valid, first-seen ids. Mark the rest for repair.
    // taken holds every string id seen (valid or not) plus every id assigned
    // below, so a fresh id never equals an id already in use.
    var accepted = new Set();
    var taken = new Set();
    var max = 0;
    var repair = [];
    for (var j = 0; j < kept.length; j += 1) {
      var id = kept[j].id;
      if (typeof id === "string") {
        taken.add(id);
      }
      if (typeof id === "string" && ID_PATTERN.test(id) && !accepted.has(id)) {
        accepted.add(id);
        var n = Number(id.slice(1));
        if (n > max) {
          max = n;
        }
      } else {
        repair.push(kept[j]);
      }
    }

    // Pass 2: one running counter from the accepted maximum, in item order.
    // Linear in the number of items.
    var counter = max + 1;
    for (var k = 0; k < repair.length; k += 1) {
      while (taken.has("t" + counter)) {
        counter += 1;
      }
      var fresh = "t" + counter;
      repair[k].id = fresh;
      taken.add(fresh);
      counter += 1;
    }
    return kept;
  }

  // ---------------------------------------------------------------------
  // Storage resolution, memory double, store
  // ---------------------------------------------------------------------

  // Returns a usable storage-like object or null. Never throws.
  function resolveStorage(getter) {
    try {
      var candidate = getter();
      if (
        candidate !== null &&
        candidate !== undefined &&
        typeof candidate.getItem === "function" &&
        typeof candidate.setItem === "function"
      ) {
        return candidate;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  // Map-backed test double. Not used by the app at runtime.
  function createMemoryStorage() {
    var data = new Map();
    return {
      getItem: function (key) {
        return data.has(key) ? data.get(key) : null;
      },
      setItem: function (key, value) {
        data.set(key, String(value));
      }
    };
  }

  // load() and save() never throw. No in-memory mirror.
  function createStore(options) {
    var storage = options && options.storage ? options.storage : null;
    var key = options && typeof options.key === "string" ? options.key : STORAGE_KEY;
    return {
      load: function () {
        if (!storage) {
          return [];
        }
        try {
          return restore(storage.getItem(key));
        } catch (error) {
          return [];
        }
      },
      save: function (tasks) {
        if (!storage) {
          return false;
        }
        try {
          storage.setItem(key, serialize(tasks));
          return true;
        } catch (error) {
          return false;
        }
      }
    };
  }

  // ---------------------------------------------------------------------
  // Controller: owns the current list. The constructor never saves.
  // ---------------------------------------------------------------------

  function createController(options) {
    var store = options && options.store ? options.store : createStore({});
    var tasks = asList(store.load()).slice();

    function hasId(id) {
      return tasks.some(function (task) {
        return task && task.id === id;
      });
    }

    return {
      getTasks: function () {
        return tasks.map(copyTask);
      },
      add: function (raw) {
        var outcome = submitOutcome(tasks, raw);
        if (outcome.ok) {
          tasks = outcome.tasks;
          store.save(tasks);
        }
        // Return copies so the caller cannot reach the controller's own list.
        var result = {};
        Object.keys(outcome).forEach(function (name) {
          result[name] = outcome[name];
        });
        result.task = outcome.task ? copyTask(outcome.task) : null;
        result.tasks = outcome.tasks.map(function (item) {
          return item !== null && typeof item === "object" ? copyTask(item) : item;
        });
        return result;
      },
      toggle: function (id) {
        if (!hasId(id)) {
          return false;
        }
        tasks = toggleTask(tasks, id);
        store.save(tasks);
        return true;
      },
      remove: function (id) {
        var focus = focusAfterDelete(tasks, id);
        if (!hasId(id)) {
          return { changed: false, focus: focus };
        }
        tasks = deleteTask(tasks, id);
        store.save(tasks);
        return { changed: true, focus: focus };
      }
    };
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    STORAGE_VERSION: STORAGE_VERSION,
    MESSAGES: MESSAGES,
    validateText: validateText,
    submitOutcome: submitOutcome,
    nextId: nextId,
    addTask: addTask,
    toggleTask: toggleTask,
    deleteTask: deleteTask,
    focusAfterDelete: focusAfterDelete,
    serialize: serialize,
    restore: restore,
    resolveStorage: resolveStorage,
    createMemoryStorage: createMemoryStorage,
    createStore: createStore,
    createController: createController
  };

  if (typeof module === "object" && module !== null && module.exports) {
    module.exports = api;
  } else {
    globalThis.TodoLogic = api;
  }
})();
