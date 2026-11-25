"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const logic = require("../todo-logic.js");

const {
  MESSAGES,
  STORAGE_KEY,
  STORAGE_VERSION,
  validateText,
  submitOutcome,
  nextId,
  addTask,
  toggleTask,
  deleteTask,
  focusAfterDelete,
  serialize,
  restore,
  resolveStorage,
  createMemoryStorage,
  createStore,
  createController
} = logic;

// ---------------------------------------------------------------------------
// Shared helpers (kept inside this file: no helper files in test/)
// ---------------------------------------------------------------------------

function task(id, text, completed) {
  return { id: id, text: text, completed: Boolean(completed) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Freezes the array and every task, so any mutation attempt throws in strict mode.
function deepFreezeList(list) {
  list.forEach(Object.freeze);
  return Object.freeze(list);
}

function build(...texts) {
  let tasks = [];
  texts.forEach((text) => {
    tasks = addTask(tasks, text).tasks;
  });
  return tasks;
}

const BLANK_INPUTS = [
  ["empty string", ""],
  ["spaces", "   "],
  ["tab", "\t"],
  ["newline", "\n"],
  ["mixed whitespace", " \t\n \r\n  "],
  ["null", null],
  ["undefined", undefined],
  ["number", 42],
  ["object", { text: "x" }]
];

// ===========================================================================
// SECTION 1: logic core (T2)
// ===========================================================================

describe("core: exports and constants", () => {
  test("constants have the documented values", () => {
    assert.equal(STORAGE_KEY, "todoApp.tasks");
    assert.equal(STORAGE_VERSION, 1);
    assert.match(MESSAGES.blank, /cannot be blank/i);
  });

  test("core API members are functions", () => {
    for (const name of [
      "validateText",
      "submitOutcome",
      "nextId",
      "addTask",
      "toggleTask",
      "deleteTask",
      "focusAfterDelete"
    ]) {
      assert.equal(typeof logic[name], "function", name);
    }
  });
});

describe("core: validateText", () => {
  for (const [label, value] of BLANK_INPUTS) {
    test(`blank: ${label}`, () => {
      assert.deepEqual(validateText(value), { ok: false, error: "blank" });
    });
  }

  test("trims surrounding whitespace", () => {
    assert.deepEqual(validateText("  Buy milk  "), { ok: true, text: "Buy milk" });
  });

  test("keeps inner whitespace", () => {
    assert.deepEqual(validateText("  a  b\tc "), { ok: true, text: "a  b\tc" });
  });
});

describe("core: addTask", () => {
  test("trims text (AC-1)", () => {
    const result = addTask([], "  Buy milk  ");
    assert.equal(result.error, null);
    assert.equal(result.task.text, "Buy milk");
    assert.equal(result.task.completed, false);
    assert.deepEqual(result.tasks, [result.task]);
  });

  test("new task has only id, text and completed", () => {
    const result = addTask([], "x");
    assert.deepEqual(Object.keys(result.task).sort(), ["completed", "id", "text"]);
  });

  test("preserves order A, B, C (AC-3)", () => {
    const tasks = build("A", "B", "C");
    assert.deepEqual(
      tasks.map((t) => t.text),
      ["A", "B", "C"]
    );
  });

  test("two tasks named Same get different ids (AC-3)", () => {
    const tasks = build("Same", "Same");
    assert.equal(tasks.length, 2);
    assert.notEqual(tasks[0].id, tasks[1].id);
  });

  test("does not mutate the input array or its tasks", () => {
    const input = deepFreezeList([task("t1", "A"), task("t2", "B", true)]);
    const before = clone(input);
    const result = addTask(input, "C");
    assert.deepEqual(input, before);
    assert.notEqual(result.tasks, input);
    assert.equal(result.tasks.length, 3);
  });

  for (const [label, value] of BLANK_INPUTS) {
    test(`blank add leaves the list unchanged and task null: ${label} (AC-2)`, () => {
      const input = deepFreezeList([task("t1", "A"), task("t2", "B", true)]);
      const before = clone(input);
      const result = addTask(input, value);
      assert.equal(result.task, null);
      assert.equal(result.error, "blank");
      assert.deepEqual(result.tasks, before);
      assert.deepEqual(input, before);
    });
  }

  test("blank add on an empty list gives an empty list", () => {
    assert.deepEqual(addTask([], "   ").tasks, []);
  });
});

describe("core: toggleTask", () => {
  test("flips completed and flips back, leaving others untouched (AC-4)", () => {
    const start = build("A", "B", "C");
    const once = toggleTask(start, start[1].id);
    assert.deepEqual(
      once.map((t) => t.completed),
      [false, true, false]
    );
    assert.deepEqual(once[0], start[0]);
    assert.deepEqual(once[2], start[2]);
    const twice = toggleTask(once, start[1].id);
    assert.deepEqual(twice, start);
  });

  test("does not mutate input", () => {
    const input = deepFreezeList(build("A", "B"));
    const before = clone(input);
    const result = toggleTask(input, input[0].id);
    assert.deepEqual(input, before);
    assert.notEqual(result, input);
  });

  test("toggling the second of two Same tasks leaves the first (AC-3)", () => {
    const start = build("Same", "Same");
    const result = toggleTask(start, start[1].id);
    assert.equal(result[0].completed, false);
    assert.equal(result[1].completed, true);
  });

  test("toggling the first of two Same tasks leaves the second (AC-3)", () => {
    const start = build("Same", "Same");
    const result = toggleTask(start, start[0].id);
    assert.equal(result[0].completed, true);
    assert.equal(result[1].completed, false);
  });

  test("unknown id leaves the list unchanged", () => {
    const start = deepFreezeList(build("A", "B"));
    const result = toggleTask(start, "t999");
    assert.deepEqual(result, clone(start));
  });

  test("acts on id only, never on text", () => {
    const start = [task("t1", "t2"), task("t2", "t1")];
    const result = toggleTask(start, "t2");
    assert.deepEqual(
      result.map((t) => t.completed),
      [false, true]
    );
  });
});

describe("core: deleteTask", () => {
  test("deleting B of A, B, C gives A, C in order (AC-5)", () => {
    const start = build("A", "B", "C");
    const result = deleteTask(start, start[1].id);
    assert.deepEqual(
      result.map((t) => t.text),
      ["A", "C"]
    );
  });

  test("does not mutate input", () => {
    const input = deepFreezeList(build("A", "B"));
    const before = clone(input);
    const result = deleteTask(input, input[0].id);
    assert.deepEqual(input, before);
    assert.equal(result.length, 1);
  });

  test("duplicate-named: deleting the second leaves the first (AC-3)", () => {
    const start = build("Same", "Same");
    const result = deleteTask(start, start[1].id);
    assert.deepEqual(result, [start[0]]);
  });

  test("duplicate-named: deleting the first leaves the second (AC-3)", () => {
    const start = build("Same", "Same");
    const result = deleteTask(start, start[0].id);
    assert.deepEqual(result, [start[1]]);
  });

  test("unknown id leaves the list unchanged", () => {
    const start = deepFreezeList(build("A", "B"));
    assert.deepEqual(deleteTask(start, "nope"), clone(start));
  });

  test("deleting the only task gives an empty list", () => {
    const start = build("A");
    assert.deepEqual(deleteTask(start, start[0].id), []);
  });
});

describe("core: nextId", () => {
  test("empty list gives t1", () => {
    assert.equal(nextId([]), "t1");
  });

  test("t1, t2, t5 gives t6", () => {
    assert.equal(nextId([task("t1", "a"), task("t2", "b"), task("t5", "c")]), "t6");
  });

  test("non-matching ids are ignored", () => {
    const tasks = [
      task('a"]', "a"),
      task("__proto__", "b"),
      task("constructor", "c"),
      task("", "d"),
      task("t1234567890123456", "e"), // 16 digits
      task("T9", "f"),
      task("t", "g"),
      task("t1x", "h")
    ];
    assert.equal(nextId(tasks), "t1");
  });

  test("non-string ids and non-object items are ignored", () => {
    const tasks = [{ id: 7 }, { id: null }, {}, null, undefined, "t9", 3];
    assert.equal(nextId(tasks), "t1");
  });

  test("a matching id mixed with non-matching ones still counts", () => {
    assert.equal(nextId([task('a"]', "a"), task("t3", "b"), task("t1234567890123456", "c")]), "t4");
  });

  test("15-digit maximum rolls to a 16-digit id without precision loss", () => {
    assert.equal(nextId([task("t999999999999999", "a")]), "t1000000000000000");
  });

  test("result is never already present in the list", () => {
    const lists = [
      [],
      [task("t1", "a")],
      [task("t0", "a")],
      [task("t007", "a"), task("t7", "b")],
      [task("t0001", "a"), task("t2", "b")],
      [task("t2", "a"), task("t1", "b"), task("t3", "c")],
      [task("t999999999999999", "a"), task("t1000000000000000", "b")]
    ];
    for (const list of lists) {
      const id = nextId(list);
      assert.match(id, /^t[0-9]{1,17}$/);
      assert.equal(
        list.some((t) => t.id === id),
        false,
        JSON.stringify(list)
      );
    }
    assert.equal(nextId([task("t007", "a"), task("t7", "b")]), "t8");
  });

  // At the 15-digit boundary max + 1 is a 16-digit id. That id does not match
  // the id pattern, so only the "remember every string id" rule makes the
  // increment-until-unique loop run. Each case below executes its body.
  test("the increment-until-unique loop runs once: the candidate is already a string id", () => {
    const list = [task("t999999999999999", "a"), task("t1000000000000000", "b")];
    assert.equal(nextId(list), "t1000000000000001");
  });

  test("the increment-until-unique loop runs several times", () => {
    const list = [
      task("t999999999999999", "a"),
      task("t1000000000000002", "c"),
      task("t1000000000000000", "b"),
      task("t1000000000000001", "d")
    ];
    assert.equal(nextId(list), "t1000000000000003");
  });

  test("the loop also skips string ids of items that are not otherwise counted", () => {
    // The 16-digit ids never raise max; only membership in the seen set can
    // stop t1000000000000000 from being returned a second time.
    assert.equal(
      nextId([task("t999999999999999", "a"), { id: "t1000000000000000" }]),
      "t1000000000000001"
    );
  });

  test("non-pattern string ids do not change the numbering", () => {
    assert.equal(nextId([task("t1", "a"), task("hello", "b"), task("t1000000000000000", "c")]), "t2");
  });

  test("sequential addTask after the 15-digit boundary gives distinct ids (CR-1)", () => {
    const first = addTask([task("t999999999999999", "a")], "b");
    const second = addTask(first.tasks, "c");
    const third = addTask(second.tasks, "d");
    assert.deepEqual(idsOf(third.tasks), [
      "t999999999999999",
      "t1000000000000000",
      "t1000000000000001",
      "t1000000000000002"
    ]);
    assert.equal(new Set(idsOf(third.tasks)).size, 4);
    // Toggling the newest task touches only that task.
    const toggled = toggleTask(third.tasks, third.task.id);
    assert.deepEqual(
      toggled.map((t) => t.completed),
      [false, false, false, true]
    );
  });

  test("deleting the highest id allows its reuse", () => {
    const start = build("A", "B", "C");
    const highest = start[2].id;
    const afterDelete = deleteTask(start, highest);
    const added = addTask(afterDelete, "D");
    assert.equal(added.task.id, highest);
    const ids = added.tasks.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("ids from repeated adds are unique", () => {
    const tasks = build("a", "b", "c", "d", "e");
    assert.equal(new Set(tasks.map((t) => t.id)).size, 5);
  });

  test("does not mutate input", () => {
    const input = deepFreezeList([task("t1", "a")]);
    nextId(input);
    assert.deepEqual(input, [task("t1", "a")]);
  });
});

describe("core: submitOutcome", () => {
  test("success shape (AC-1, AC-8)", () => {
    const start = build("A");
    const out = submitOutcome(start, "  Buy milk  ");
    assert.equal(out.ok, true);
    assert.equal(out.error, null);
    assert.equal(out.message, "");
    assert.equal(out.inputValue, "");
    assert.equal(out.focus, "input");
    assert.equal(out.task.text, "Buy milk");
    assert.equal(out.tasks.length, 2);
    assert.deepEqual(out.tasks[1], out.task);
    assert.deepEqual(out.tasks[0], start[0]);
    assert.deepEqual(Object.keys(out).sort(), [
      "error",
      "focus",
      "inputValue",
      "message",
      "ok",
      "task",
      "tasks"
    ]);
  });

  for (const [label, value] of BLANK_INPUTS) {
    test(`blank shape: ${label} (AC-2, AC-8)`, () => {
      const start = deepFreezeList([task("t1", "A"), task("t2", "B", true)]);
      const before = clone(start);
      const out = submitOutcome(start, value);
      assert.equal(out.ok, false);
      assert.equal(out.error, "blank");
      assert.equal(out.message, MESSAGES.blank);
      assert.match(out.message, /cannot be blank/i);
      assert.equal(out.inputValue, "");
      assert.equal(out.focus, "input");
      assert.equal(out.task, null);
      assert.deepEqual(out.tasks, before);
      assert.deepEqual(start, before);
    });
  }

  test("blank on an empty list keeps it empty", () => {
    const out = submitOutcome([], "   ");
    assert.deepEqual(out.tasks, []);
    assert.equal(out.ok, false);
  });

  test("a later valid submit has an empty message (AC-9 outcome half)", () => {
    const first = submitOutcome([], "  ");
    assert.equal(first.message, MESSAGES.blank);
    const second = submitOutcome(first.tasks, "Real task");
    assert.equal(second.ok, true);
    assert.equal(second.message, "");
    assert.equal(second.inputValue, "");
  });

  test("does not mutate the input list", () => {
    const start = deepFreezeList(build("A", "B"));
    const before = clone(start);
    submitOutcome(start, "C");
    submitOutcome(start, "");
    assert.deepEqual(start, before);
  });
});

describe("core: focusAfterDelete", () => {
  const list = [task("t1", "A"), task("t2", "B"), task("t3", "C")];

  test("middle task: focus the next task", () => {
    assert.deepEqual(focusAfterDelete(list, "t2"), { kind: "task", id: "t3" });
  });

  test("first task: focus the next task", () => {
    assert.deepEqual(focusAfterDelete(list, "t1"), { kind: "task", id: "t2" });
  });

  test("last task: focus the previous task", () => {
    assert.deepEqual(focusAfterDelete(list, "t3"), { kind: "task", id: "t2" });
  });

  test("only task: focus the input", () => {
    assert.deepEqual(focusAfterDelete([task("t1", "A")], "t1"), { kind: "input" });
  });

  test("empty list: focus the input", () => {
    assert.deepEqual(focusAfterDelete([], "t1"), { kind: "input" });
  });

  test("unknown id: focus the input", () => {
    assert.deepEqual(focusAfterDelete(list, "t99"), { kind: "input" });
  });

  test("does not mutate the input", () => {
    const frozen = deepFreezeList(clone(list));
    focusAfterDelete(frozen, "t2");
    assert.deepEqual(frozen, list);
  });
});

describe("core: text round trip (AC-10 logic half)", () => {
  test("HTML-like text is stored unchanged by addTask", () => {
    const raw = "<b>x</b><script>alert(1)</script>";
    const result = addTask([], raw);
    assert.equal(result.task.text, raw);
    assert.equal(submitOutcome([], raw).task.text, raw);
  });

  test("HTML-like text survives a toggle and a neighbouring delete", () => {
    const raw = "<img src=x onerror=alert(1)>";
    let tasks = build("A", raw);
    tasks = toggleTask(tasks, tasks[1].id);
    tasks = deleteTask(tasks, tasks[0].id);
    assert.equal(tasks[0].text, raw);
    assert.equal(tasks[0].completed, true);
  });
});

// ===========================================================================
// SECTION 2: persistence (T4)
// ===========================================================================

// Fixtures (defined here on purpose: no helper files in test/).

// Spy storage: counts calls, records every written value.
function createSpyStorage(seed) {
  const data = new Map();
  if (seed !== undefined) {
    data.set(STORAGE_KEY, seed);
  }
  const spy = {
    getCalls: 0,
    setCalls: [],
    data: data,
    getItem(key) {
      spy.getCalls += 1;
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      spy.setCalls.push({ key: key, value: value });
      data.set(key, value);
    }
  };
  return spy;
}

// Throwing storage: every call throws.
function createThrowingStorage() {
  const spy = {
    getCalls: 0,
    setCalls: 0,
    getItem() {
      spy.getCalls += 1;
      throw new Error("blocked read");
    },
    setItem() {
      spy.setCalls += 1;
      throw new Error("blocked write");
    }
  };
  return spy;
}

// Storage whose writes fail until allowWrites() is called.
function createFlakyStorage() {
  const data = new Map();
  let failing = true;
  return {
    data: data,
    allowWrites() {
      failing = false;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (failing) {
        throw new Error("quota exceeded");
      }
      data.set(key, value);
    }
  };
}

function envelope(items) {
  return JSON.stringify({ version: 1, tasks: items });
}

function idsOf(tasks) {
  return tasks.map((t) => t.id);
}

describe("persistence: serialize and restore round trip", () => {
  test("serialize writes the version 1 envelope", () => {
    const tasks = [task("t1", "A"), task("t2", "B", true)];
    assert.deepEqual(JSON.parse(serialize(tasks)), {
      version: 1,
      tasks: [
        { id: "t1", text: "A", completed: false },
        { id: "t2", text: "B", completed: true }
      ]
    });
  });

  test("serialize of an empty list and of a non-array", () => {
    assert.deepEqual(JSON.parse(serialize([])), { version: 1, tasks: [] });
    assert.deepEqual(JSON.parse(serialize(undefined)), { version: 1, tasks: [] });
  });

  test("serialize writes only the three known fields", () => {
    const parsed = JSON.parse(serialize([{ id: "t1", text: "A", completed: false, extra: 1 }]));
    assert.deepEqual(Object.keys(parsed.tasks[0]), ["id", "text", "completed"]);
  });

  test("round trip keeps text, order and completion state", () => {
    const tasks = [task("t1", "A", true), task("t2", "B"), task("t3", "C", true)];
    assert.deepEqual(restore(serialize(tasks)), tasks);
  });

  test("restore returns fresh objects", () => {
    const tasks = [task("t1", "A")];
    const restored = restore(serialize(tasks));
    assert.notEqual(restored[0], tasks[0]);
  });
});

describe("persistence: restore of bad input gives an empty list (AC-11, AC-15)", () => {
  const bad = [
    ["invalid JSON", "{bad"],
    ["number", "42"],
    ["JSON null", "null"],
    ["JSON string", '"str"'],
    ["object without tasks", '{"a":1}'],
    ["tasks is a string", '{"version":1,"tasks":"x"}'],
    ["tasks is an object", '{"version":1,"tasks":{"0":{"id":"t1","text":"a"}}}'],
    ["JSON true", "true"],
    ["empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["number value", 42],
    ["object value", { tasks: [] }],
    ["array value", []],
    ["boolean value", true]
  ];
  for (const [label, value] of bad) {
    test(`${label}`, () => {
      assert.deepEqual(restore(value), []);
    });
  }

  test("restore never throws", () => {
    for (const [, value] of bad) {
      assert.doesNotThrow(() => restore(value));
    }
  });
});

describe("persistence: envelope and bare array (OD-6)", () => {
  test("an envelope with another version still loads", () => {
    const raw = JSON.stringify({ version: 99, tasks: [{ id: "t1", text: "A", completed: true }] });
    assert.deepEqual(restore(raw), [task("t1", "A", true)]);
  });

  test("an envelope with no version still loads", () => {
    const raw = JSON.stringify({ tasks: [{ id: "t1", text: "A", completed: false }] });
    assert.deepEqual(restore(raw), [task("t1", "A")]);
  });

  test("a bare array loads", () => {
    const raw = JSON.stringify([{ id: "t1", text: "A", completed: true }, { id: "t2", text: "B" }]);
    assert.deepEqual(restore(raw), [task("t1", "A", true), task("t2", "B")]);
  });

  test("an empty envelope gives an empty list", () => {
    assert.deepEqual(restore(envelope([])), []);
  });
});

describe("persistence: restore of mixed items (NFR-7)", () => {
  test("non-objects, missing or non-string text and blank text are dropped", () => {
    const raw = envelope([
      null,
      42,
      "text",
      true,
      [],
      {},
      { id: "t1" },
      { id: "t2", text: 5 },
      { id: "t3", text: null },
      { id: "t4", text: "" },
      { id: "t5", text: "   \t\n " },
      { id: "t6", text: ["x"] },
      { id: "t7", text: "keep" }
    ]);
    assert.deepEqual(restore(raw), [task("t7", "keep")]);
  });

  test("the valid subset is kept in order", () => {
    const raw = envelope([
      { id: "t1", text: "A", completed: false },
      { bad: true },
      { id: "t3", text: "C", completed: true },
      null
    ]);
    assert.deepEqual(restore(raw), [task("t1", "A"), task("t3", "C", true)]);
  });

  test("text is trimmed on restore", () => {
    const restored = restore(envelope([{ id: "t1", text: "  x  ", completed: false }]));
    assert.equal(restored[0].text, "x");
  });

  test("completed is true only for exactly true", () => {
    const raw = envelope([
      { id: "t1", text: "a", completed: true },
      { id: "t2", text: "b", completed: "true" },
      { id: "t3", text: "c", completed: 1 },
      { id: "t4", text: "d" },
      { id: "t5", text: "e", completed: null },
      { id: "t6", text: "f", completed: false },
      { id: "t7", text: "g", completed: [true] }
    ]);
    assert.deepEqual(
      restore(raw).map((t) => t.completed),
      [true, false, false, false, false, false, false]
    );
  });

  test("extra fields are not copied, including an own __proto__ key in the raw JSON", () => {
    // An object literal with __proto__ would only set the prototype and
    // JSON.stringify would drop it. A raw string makes JSON.parse create a
    // real own "__proto__" key, which is what stored data can contain.
    const raw =
      '{"version":1,"tasks":[{"id":"t1","text":"a","completed":true,"extra":"x",' +
      '"__proto__":{"polluted":1},"nested":{"a":1}}]}';
    assert.ok(Object.keys(JSON.parse(raw).tasks[0]).includes("__proto__"));
    const restored = restore(raw);
    assert.equal(restored.length, 1);
    assert.deepEqual(Object.keys(restored[0]).sort(), ["completed", "id", "text"]);
    assert.equal(Object.getPrototypeOf(restored[0]), Object.prototype);
    assert.equal(Object.prototype.hasOwnProperty.call(restored[0], "__proto__"), false);
    assert.equal(restored[0].polluted, undefined);
    assert.equal({}.polluted, undefined);
  });

  test("a raw __proto__ id value is replaced and a __proto__ key on the envelope is ignored", () => {
    const raw =
      '{"__proto__":{"polluted":1},"version":1,"tasks":[{"id":"__proto__","text":"a"},{"id":"t5","text":"b"}]}';
    assert.ok(Object.keys(JSON.parse(raw)).includes("__proto__"));
    const restored = restore(raw);
    assert.deepEqual(idsOf(restored), ["t6", "t5"]);
    assert.equal({}.polluted, undefined);
  });

  test("a stored __proto__ key does not pollute anything", () => {
    const raw = '{"version":1,"tasks":[{"id":"t1","text":"a","__proto__":{"polluted":true}}]}';
    const restored = restore(raw);
    assert.equal(restored.length, 1);
    assert.equal({}.polluted, undefined);
    assert.equal(restored[0].polluted, undefined);
  });
});

describe("persistence: restore repairs odd ids (two passes)", () => {
  const MISSING = Symbol("missing");

  function restoreWithIds(ids) {
    const items = ids.map((id, index) => {
      const item = { text: "item" + index, completed: false };
      if (id !== MISSING) {
        item.id = id;
      }
      return item;
    });
    return restore(envelope(items));
  }

  test('["t1", missing, "t1", "t5"] gives t1, t6, t7, t5', () => {
    assert.deepEqual(idsOf(restoreWithIds(["t1", MISSING, "t1", "t5"])), ["t1", "t6", "t7", "t5"]);
  });

  test("a later valid id is not taken by an earlier repair", () => {
    assert.deepEqual(idsOf(restoreWithIds([MISSING, "t1"])), ["t2", "t1"]);
    assert.deepEqual(idsOf(restoreWithIds([MISSING, MISSING, "t2"])), ["t3", "t4", "t2"]);
  });

  test("odd ids are all replaced, in item order", () => {
    const ids = idsOf(
      restoreWithIds(['a"]', "__proto__", "constructor", "", 5, "t1234567890123456", null, true])
    );
    assert.deepEqual(ids, ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"]);
  });

  test("odd ids next to a valid id continue after the maximum", () => {
    assert.deepEqual(idsOf(restoreWithIds(['a"]', "t4", "__proto__", 5])), ["t5", "t4", "t6", "t7"]);
  });

  test("a numeric id 5 is replaced, not coerced", () => {
    assert.deepEqual(idsOf(restoreWithIds([5])), ["t1"]);
  });

  test("a 16-digit id is replaced", () => {
    assert.deepEqual(idsOf(restoreWithIds(["t1234567890123456"])), ["t1"]);
  });

  test("a 15-digit id is kept and the next repair rolls over", () => {
    assert.deepEqual(idsOf(restoreWithIds(["t999999999999999", MISSING])), [
      "t999999999999999",
      "t1000000000000000"
    ]);
  });

  test("several repairs after a 15-digit id give distinct ids (CR-1)", () => {
    const ids = idsOf(restoreWithIds(["t999999999999999", MISSING, MISSING]));
    assert.deepEqual(ids, ["t999999999999999", "t1000000000000000", "t1000000000000001"]);
    assert.equal(new Set(ids).size, 3);
  });

  test("repairs after a 15-digit id stay distinct whatever the item order", () => {
    const ids = idsOf(restoreWithIds([MISSING, "t999999999999999", MISSING, "t999999999999999", 5]));
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids, [
      "t1000000000000000",
      "t999999999999999",
      "t1000000000000001",
      "t1000000000000002",
      "t1000000000000003"
    ]);
  });

  test("a stored 16-digit id is never handed out a second time", () => {
    // The 16-digit id is not valid, so its item is repaired, but it is still
    // a string id in the data and the counter must not collide with it.
    const ids = idsOf(
      restoreWithIds(["t999999999999999", "t1000000000000000", MISSING, "t1000000000000000"])
    );
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids[0], "t999999999999999");
    // The counter starts at t1000000000000000, finds it taken (the loop body
    // in restore runs), and moves on.
    assert.deepEqual(ids, [
      "t999999999999999",
      "t1000000000000001",
      "t1000000000000002",
      "t1000000000000003"
    ]);
    for (const id of ids) {
      assert.match(id, /^t[0-9]{1,16}$/);
    }
  });

  test("restoring a few thousand id-less items is fast and gives t1..tN (CR-2)", () => {
    const count = 20000;
    const items = [];
    for (let i = 0; i < count; i += 1) {
      items.push({ text: "item" + i, completed: false });
    }
    const raw = envelope(items);
    const started = process.hrtime.bigint();
    const restored = restore(raw);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(restored.length, count);
    const ids = idsOf(restored);
    assert.equal(new Set(ids).size, count);
    assert.equal(ids[0], "t1");
    assert.equal(ids[count - 1], "t" + count);
    // The old quadratic version needed about 38 s for this input. A linear
    // pass needs a few tens of milliseconds, so 5 s is a generous bound.
    assert.ok(elapsedMs < 5000, "restore took " + Math.round(elapsedMs) + " ms");
  });

  test("duplicates: the first keeps the id", () => {
    assert.deepEqual(idsOf(restoreWithIds(["t3", "t3", "t3"])), ["t3", "t4", "t5"]);
  });

  test("all ids missing: numbered from t1 in order", () => {
    assert.deepEqual(idsOf(restoreWithIds([MISSING, MISSING, MISSING])), ["t1", "t2", "t3"]);
  });

  test("dropped items do not take part in id repair", () => {
    const raw = envelope([
      { id: "t9", text: "   " },
      { id: "t1", text: "a" },
      { text: "b" }
    ]);
    assert.deepEqual(idsOf(restore(raw)), ["t1", "t2"]);
  });

  test("valid ids stay, the text and order are kept", () => {
    const restored = restoreWithIds(["t2", "t1"]);
    assert.deepEqual(
      restored.map((t) => t.text),
      ["item0", "item1"]
    );
    assert.deepEqual(idsOf(restored), ["t2", "t1"]);
  });

  test("resulting ids are unique and match the id pattern", () => {
    const restored = restoreWithIds([
      "t1",
      "t1",
      MISSING,
      'a"]',
      "__proto__",
      "constructor",
      "",
      7,
      "t3",
      "t3",
      "t1234567890123456"
    ]);
    const ids = idsOf(restored);
    assert.equal(ids.length, 11);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
      assert.match(id, /^t[0-9]{1,15}$/);
    }
  });
});

describe("persistence: resolveStorage", () => {
  test("a throwing getter gives null", () => {
    assert.equal(
      resolveStorage(() => {
        throw new Error("denied");
      }),
      null
    );
  });

  test("a getter returning null gives null", () => {
    assert.equal(resolveStorage(() => null), null);
  });

  test("a getter returning undefined gives null", () => {
    assert.equal(resolveStorage(() => undefined), null);
  });

  test("an object without functions gives null", () => {
    assert.equal(resolveStorage(() => ({})), null);
    assert.equal(resolveStorage(() => ({ getItem: 1, setItem: 2 })), null);
  });

  test("an object with only one of the functions gives null", () => {
    assert.equal(resolveStorage(() => ({ getItem() {} })), null);
    assert.equal(resolveStorage(() => ({ setItem() {} })), null);
  });

  test("a primitive gives null", () => {
    assert.equal(resolveStorage(() => 5), null);
    assert.equal(resolveStorage(() => "storage"), null);
  });

  test("a getter that is not a function gives null and does not throw", () => {
    assert.equal(resolveStorage(undefined), null);
    assert.equal(resolveStorage(null), null);
  });

  test("an object whose method read throws gives null", () => {
    const hostile = {};
    Object.defineProperty(hostile, "getItem", {
      get() {
        throw new Error("denied");
      }
    });
    assert.equal(resolveStorage(() => hostile), null);
  });

  test("a valid storage is returned as is", () => {
    const good = createMemoryStorage();
    assert.equal(resolveStorage(() => good), good);
  });
});

describe("persistence: createMemoryStorage", () => {
  test("getItem is null for a missing key; setItem then getItem returns the value", () => {
    const storage = createMemoryStorage();
    assert.equal(storage.getItem("k"), null);
    storage.setItem("k", "v");
    assert.equal(storage.getItem("k"), "v");
    storage.setItem("k", "w");
    assert.equal(storage.getItem("k"), "w");
  });

  test("instances do not share data", () => {
    const a = createMemoryStorage();
    const b = createMemoryStorage();
    a.setItem("k", "v");
    assert.equal(b.getItem("k"), null);
  });
});

describe("persistence: createStore", () => {
  const unusable = [
    ["null storage", () => createStore({ storage: null })],
    ["undefined storage", () => createStore({ storage: undefined })],
    ["no options", () => createStore()],
    ["throwing storage", () => createStore({ storage: createThrowingStorage() })],
    ["object without functions", () => createStore({ storage: {} })]
  ];

  for (const [label, make] of unusable) {
    test(`load returns [] and save returns false, nothing throws: ${label}`, () => {
      const store = make();
      assert.deepEqual(store.load(), []);
      assert.equal(store.save([task("t1", "A")]), false);
    });
  }

  test("save returns true on a good storage and writes the envelope under the default key", () => {
    const spy = createSpyStorage();
    const store = createStore({ storage: spy });
    assert.equal(store.save([task("t1", "A", true)]), true);
    assert.equal(spy.setCalls.length, 1);
    assert.equal(spy.setCalls[0].key, STORAGE_KEY);
    assert.deepEqual(JSON.parse(spy.setCalls[0].value), {
      version: 1,
      tasks: [{ id: "t1", text: "A", completed: true }]
    });
  });

  test("load reads the stored value through restore", () => {
    const spy = createSpyStorage(envelope([{ id: "t1", text: " A ", completed: true }]));
    assert.deepEqual(createStore({ storage: spy }).load(), [task("t1", "A", true)]);
  });

  test("a custom key is used for load and save", () => {
    const storage = createMemoryStorage();
    const store = createStore({ storage: storage, key: "other.key" });
    store.save([task("t1", "A")]);
    assert.equal(storage.getItem(STORAGE_KEY), null);
    assert.deepEqual(store.load(), [task("t1", "A")]);
    assert.equal(typeof storage.getItem("other.key"), "string");
  });

  test("save does not keep an in-memory mirror: a failed save loads nothing back", () => {
    const store = createStore({ storage: createThrowingStorage() });
    store.save([task("t1", "A")]);
    assert.deepEqual(store.load(), []);
  });

  test("a later save retries real storage after a failure", () => {
    const flaky = createFlakyStorage();
    const store = createStore({ storage: flaky });
    assert.equal(store.save([task("t1", "A")]), false);
    assert.equal(flaky.data.size, 0);
    flaky.allowWrites();
    assert.equal(store.save([task("t1", "A"), task("t2", "B")]), true);
    assert.deepEqual(store.load(), [task("t1", "A"), task("t2", "B")]);
  });

  test("the store has no isPersistent member", () => {
    assert.deepEqual(Object.keys(createStore({ storage: null })).sort(), ["load", "save"]);
  });
});

describe("persistence: controller with spy storage (FR-8)", () => {
  test("add of a valid task saves exactly once, with trimmed text (AC-1)", () => {
    const spy = createSpyStorage();
    const controller = createController({ store: createStore({ storage: spy }) });
    const outcome = controller.add("  Buy milk  ");
    assert.equal(outcome.ok, true);
    assert.equal(outcome.inputValue, "");
    assert.equal(spy.setCalls.length, 1);
    assert.equal(spy.setCalls[0].key, STORAGE_KEY);
    const stored = JSON.parse(spy.setCalls[0].value);
    assert.equal(stored.version, 1);
    assert.deepEqual(
      stored.tasks.map((t) => t.text),
      ["Buy milk"]
    );
    assert.equal(controller.getTasks()[0].text, "Buy milk");
  });

  for (const [label, value] of BLANK_INPUTS) {
    test(`blank add makes zero setItem calls and leaves tasks unchanged: ${label} (AC-2)`, () => {
      const seeded = envelope([
        { id: "t1", text: "A", completed: false },
        { id: "t2", text: "B", completed: true }
      ]);
      const spy = createSpyStorage(seeded);
      const controller = createController({ store: createStore({ storage: spy }) });
      const before = clone(controller.getTasks());
      const outcome = controller.add(value);
      assert.equal(outcome.ok, false);
      assert.equal(outcome.message, MESSAGES.blank);
      assert.equal(spy.setCalls.length, 0);
      assert.deepEqual(controller.getTasks(), before);
      assert.equal(spy.data.get(STORAGE_KEY), seeded);
    });
  }

  test("toggle and remove save once each", () => {
    const spy = createSpyStorage(
      envelope([
        { id: "t1", text: "A", completed: false },
        { id: "t2", text: "B", completed: false }
      ])
    );
    const controller = createController({ store: createStore({ storage: spy }) });
    assert.equal(controller.toggle("t1"), true);
    assert.equal(spy.setCalls.length, 1);
    assert.equal(controller.remove("t2").changed, true);
    assert.equal(spy.setCalls.length, 2);
    assert.deepEqual(controller.getTasks(), [task("t1", "A", true)]);
    assert.deepEqual(JSON.parse(spy.setCalls[1].value).tasks, [task("t1", "A", true)]);
  });

  test("a toggle or remove of an unknown id saves zero times and changes nothing", () => {
    const spy = createSpyStorage(envelope([{ id: "t1", text: "A", completed: false }]));
    const controller = createController({ store: createStore({ storage: spy }) });
    const before = clone(controller.getTasks());
    assert.equal(controller.toggle("nope"), false);
    const removed = controller.remove("nope");
    assert.equal(removed.changed, false);
    assert.deepEqual(removed.focus, { kind: "input" });
    assert.equal(spy.setCalls.length, 0);
    assert.deepEqual(controller.getTasks(), before);
  });

  test("the constructor makes zero setItem calls on an empty store", () => {
    const spy = createSpyStorage();
    createController({ store: createStore({ storage: spy }) });
    assert.equal(spy.setCalls.length, 0);
    assert.equal(spy.getCalls, 1);
  });

  test("the constructor makes zero setItem calls over bad items and repairable ids", () => {
    const seeded = envelope([
      null,
      { id: "t1", text: "A" },
      { id: "t1", text: "dup" },
      { text: "no id" },
      { id: "__proto__", text: "odd" },
      { id: "t2", text: "   " }
    ]);
    const spy = createSpyStorage(seeded);
    const controller = createController({ store: createStore({ storage: spy }) });
    assert.equal(spy.setCalls.length, 0);
    assert.equal(spy.data.get(STORAGE_KEY), seeded);
    const tasks = controller.getTasks();
    assert.deepEqual(
      tasks.map((t) => t.text),
      ["A", "dup", "no id", "odd"]
    );
    assert.deepEqual(idsOf(tasks), ["t1", "t2", "t3", "t4"]);
  });

  test("the constructor makes zero setItem calls over bad JSON", () => {
    const spy = createSpyStorage("{bad");
    createController({ store: createStore({ storage: spy }) });
    assert.equal(spy.setCalls.length, 0);
  });

  test("repaired data is written on the next real change", () => {
    const spy = createSpyStorage(envelope([{ text: "no id" }, { id: "t1", text: "A" }]));
    const controller = createController({ store: createStore({ storage: spy }) });
    assert.equal(spy.setCalls.length, 0);
    controller.add("B");
    assert.equal(spy.setCalls.length, 1);
    assert.deepEqual(idsOf(JSON.parse(spy.setCalls[0].value).tasks), ["t2", "t1", "t3"]);
  });

  test("remove focus plan: middle task gives the next task", () => {
    const controller = createController({ store: createStore({ storage: createMemoryStorage() }) });
    controller.add("A");
    controller.add("B");
    controller.add("C");
    const ids = idsOf(controller.getTasks());
    const result = controller.remove(ids[1]);
    assert.deepEqual(result, { changed: true, focus: { kind: "task", id: ids[2] } });
  });

  test("remove focus plan: last task gives the previous task", () => {
    const controller = createController({ store: createStore({ storage: createMemoryStorage() }) });
    controller.add("A");
    controller.add("B");
    const ids = idsOf(controller.getTasks());
    assert.deepEqual(controller.remove(ids[1]), {
      changed: true,
      focus: { kind: "task", id: ids[0] }
    });
  });

  test("remove focus plan: only task gives the input", () => {
    const controller = createController({ store: createStore({ storage: createMemoryStorage() }) });
    controller.add("A");
    const id = controller.getTasks()[0].id;
    assert.deepEqual(controller.remove(id), { changed: true, focus: { kind: "input" } });
    assert.deepEqual(controller.getTasks(), []);
  });

  test("remove focus plan: unknown id gives the input and no change", () => {
    const controller = createController({ store: createStore({ storage: createMemoryStorage() }) });
    controller.add("A");
    assert.deepEqual(controller.remove("zzz"), { changed: false, focus: { kind: "input" } });
  });

  test("getTasks returns copies: editing the result does not change the controller", () => {
    const controller = createController({ store: createStore({ storage: createMemoryStorage() }) });
    controller.add("A");
    const copy = controller.getTasks();
    copy[0].text = "changed";
    copy.push(task("t9", "extra"));
    assert.deepEqual(
      controller.getTasks().map((t) => t.text),
      ["A"]
    );
  });

  test("add returns copies: editing the outcome does not change the controller (CR-3)", () => {
    const spy = createSpyStorage();
    const controller = createController({ store: createStore({ storage: spy }) });
    const outcome = controller.add("A");
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.task, task("t1", "A"));
    assert.deepEqual(outcome.tasks, [task("t1", "A")]);
    outcome.task.text = "mut";
    outcome.tasks[0].text = "mut too";
    outcome.tasks.push(task("t9", "evil"));
    outcome.message = "changed";
    assert.deepEqual(controller.getTasks(), [task("t1", "A")]);
    // Nothing was saved because of the edits, and the next id is unaffected.
    assert.equal(spy.setCalls.length, 1);
    const second = controller.add("B");
    assert.equal(second.task.id, "t2");
    assert.deepEqual(
      controller.getTasks().map((t) => t.text),
      ["A", "B"]
    );
    assert.deepEqual(
      JSON.parse(spy.setCalls[1].value).tasks.map((t) => t.text),
      ["A", "B"]
    );
  });

  test("add outcome keeps the submitOutcome shape and is a new object each time", () => {
    const controller = createController({ store: createStore({ storage: createMemoryStorage() }) });
    const first = controller.add("A");
    assert.deepEqual(Object.keys(first).sort(), Object.keys(submitOutcome([], "A")).sort());
    assert.notEqual(first.task, first.tasks[0]);
    assert.deepEqual(first.task, first.tasks[0]);
    const second = controller.add("B");
    assert.notEqual(first.tasks, second.tasks);
    assert.notEqual(first.tasks[0], second.tasks[0]);
  });

  test("a blank add also returns a copy of the list (CR-3)", () => {
    const controller = createController({ store: createStore({ storage: createMemoryStorage() }) });
    controller.add("A");
    const outcome = controller.add("   ");
    assert.equal(outcome.ok, false);
    assert.equal(outcome.task, null);
    assert.equal(outcome.message, MESSAGES.blank);
    outcome.tasks[0].text = "mut";
    outcome.tasks.length = 0;
    assert.deepEqual(controller.getTasks(), [task("t1", "A")]);
  });

  test("a controller without a store works in memory", () => {
    const controller = createController({});
    assert.equal(controller.add("A").ok, true);
    assert.equal(controller.getTasks().length, 1);
  });
});

describe("persistence: refresh simulation (AC-6, AC-5, AC-3)", () => {
  test("a second controller on the same storage sees the same tasks", () => {
    const storage = createMemoryStorage();
    const first = createController({ store: createStore({ storage: storage }) });
    first.add("A");
    first.add("B");
    first.add("C");
    const idB = first.getTasks()[1].id;
    const idA = first.getTasks()[0].id;
    assert.equal(first.toggle(idB), true);
    assert.equal(first.remove(idA).changed, true);

    const second = createController({ store: createStore({ storage: storage }) });
    assert.deepEqual(second.getTasks(), first.getTasks());
    assert.deepEqual(
      second.getTasks().map((t) => [t.text, t.completed]),
      [
        ["B", true],
        ["C", false]
      ]
    );
    assert.equal(
      second.getTasks().some((t) => t.text === "A"),
      false
    );
  });

  test("new ids after a refresh do not collide with restored ids", () => {
    const storage = createMemoryStorage();
    const first = createController({ store: createStore({ storage: storage }) });
    first.add("A");
    first.add("B");
    const second = createController({ store: createStore({ storage: storage }) });
    second.add("C");
    const ids = idsOf(second.getTasks());
    assert.equal(new Set(ids).size, 3);
  });

  test("two tasks named Same keep independent state after restore (AC-3)", () => {
    const storage = createMemoryStorage();
    const first = createController({ store: createStore({ storage: storage }) });
    first.add("Same");
    first.add("Same");
    first.toggle(first.getTasks()[1].id);

    const second = createController({ store: createStore({ storage: storage }) });
    let tasks = second.getTasks();
    assert.deepEqual(
      tasks.map((t) => t.completed),
      [false, true]
    );
    assert.notEqual(tasks[0].id, tasks[1].id);

    second.toggle(tasks[0].id);
    tasks = second.getTasks();
    assert.deepEqual(
      tasks.map((t) => t.completed),
      [true, true]
    );
    second.remove(tasks[1].id);
    const third = createController({ store: createStore({ storage: storage }) });
    assert.deepEqual(
      third.getTasks().map((t) => [t.text, t.completed]),
      [["Same", true]]
    );
  });

  test("a deleted-last list stays empty after a refresh", () => {
    const storage = createMemoryStorage();
    const first = createController({ store: createStore({ storage: storage }) });
    first.add("A");
    first.remove(first.getTasks()[0].id);
    const second = createController({ store: createStore({ storage: storage }) });
    assert.deepEqual(second.getTasks(), []);
  });
});

describe("persistence: recovery from bad stored data (AC-11)", () => {
  const seeds = ["{bad", "42", "null", '"str"', '{"a":1}', '{"version":1,"tasks":"x"}', ""];
  for (const seed of seeds) {
    test(`starts empty, add works, next save overwrites: ${JSON.stringify(seed)}`, () => {
      const spy = createSpyStorage(seed);
      const controller = createController({ store: createStore({ storage: spy }) });
      assert.deepEqual(controller.getTasks(), []);
      assert.equal(spy.data.get(STORAGE_KEY), seed);
      assert.equal(controller.add("Fresh").ok, true);
      assert.equal(spy.setCalls.length, 1);
      assert.deepEqual(JSON.parse(spy.data.get(STORAGE_KEY)).tasks, [task("t1", "Fresh")]);
      const reloaded = createController({ store: createStore({ storage: spy }) });
      assert.deepEqual(reloaded.getTasks(), [task("t1", "Fresh")]);
    });
  }

  test("a mixed array recovers the valid subset", () => {
    const spy = createSpyStorage(
      envelope([{ id: "t1", text: "ok" }, 7, { id: "t2", text: "" }, { id: "t3", text: "ok too", completed: true }])
    );
    const controller = createController({ store: createStore({ storage: spy }) });
    assert.deepEqual(controller.getTasks(), [task("t1", "ok"), task("t3", "ok too", true)]);
  });
});

describe("persistence: storage failures keep the app working (AC-12, NFR-7)", () => {
  const broken = [
    ["throwing storage", () => createThrowingStorage()],
    ["null storage", () => null],
    ["undefined storage", () => undefined],
    ["storage from a throwing getter", () =>
      resolveStorage(() => {
        throw new Error("denied");
      })]
  ];

  for (const [label, make] of broken) {
    test(`starts empty, add is ok, list shows the task, nothing throws: ${label}`, () => {
      const store = createStore({ storage: make() });
      const controller = createController({ store: store });
      assert.deepEqual(controller.getTasks(), []);
      const outcome = controller.add("Still works");
      assert.equal(outcome.ok, true);
      assert.deepEqual(controller.getTasks(), [task("t1", "Still works")]);
      assert.equal(controller.toggle("t1"), true);
      assert.equal(controller.getTasks()[0].completed, true);
      assert.equal(controller.remove("t1").changed, true);
      assert.deepEqual(controller.getTasks(), []);
      assert.equal(store.save(controller.getTasks()), false);
    });
  }

  test("a throwing storage is written to on each change (retry), never read twice", () => {
    const storage = createThrowingStorage();
    const controller = createController({ store: createStore({ storage: storage }) });
    controller.add("A");
    controller.add("B");
    assert.equal(storage.getCalls, 1);
    assert.equal(storage.setCalls, 2);
  });
});

describe("persistence: HTML-like text survives (AC-10)", () => {
  test("add, serialize and restore keep <b>x</b><script>alert(1)</script> unchanged", () => {
    const raw = "<b>x</b><script>alert(1)</script>";
    const added = addTask([], raw).tasks;
    assert.equal(added[0].text, raw);
    const restored = restore(serialize(added));
    assert.equal(restored[0].text, raw);
  });

  test("through a controller and a second controller", () => {
    const raw = "<b>x</b><script>alert(1)</script>";
    const storage = createMemoryStorage();
    createController({ store: createStore({ storage: storage }) }).add(raw);
    const reloaded = createController({ store: createStore({ storage: storage }) });
    assert.equal(reloaded.getTasks()[0].text, raw);
  });
});

// ===========================================================================
// SECTION 3: UMD browser branch via vm (T5)
// ===========================================================================

describe("vm: browser branch of the dual export", () => {
  const EXPECTED_TYPES = {
    STORAGE_KEY: "string",
    STORAGE_VERSION: "number",
    MESSAGES: "object",
    validateText: "function",
    submitOutcome: "function",
    nextId: "function",
    addTask: "function",
    toggleTask: "function",
    deleteTask: "function",
    focusAfterDelete: "function",
    serialize: "function",
    restore: "function",
    resolveStorage: "function",
    createMemoryStorage: "function",
    createStore: "function",
    createController: "function"
  };

  const source = fs.readFileSync(path.join(__dirname, "..", "todo-logic.js"), "utf8");

  function load() {
    const context = vm.createContext({});
    vm.runInContext(source, context, { filename: "todo-logic.js" });
    return context;
  }

  test("running the file in an empty context throws nothing", () => {
    assert.doesNotThrow(() => load());
  });

  test("TodoLogic is attached to the global object of the context", () => {
    const context = load();
    assert.equal(typeof context.TodoLogic, "object");
    assert.notEqual(context.TodoLogic, null);
  });

  test("it exposes every exported name with the right typeof, and nothing else", () => {
    const api = load().TodoLogic;
    for (const [name, type] of Object.entries(EXPECTED_TYPES)) {
      assert.equal(typeof api[name], type, name);
    }
    assert.equal(
      JSON.stringify(Object.keys(api).sort()),
      JSON.stringify(Object.keys(EXPECTED_TYPES).sort())
    );
  });

  test("the file does not set module.exports in that context (none exists)", () => {
    const context = load();
    assert.equal(context.module, undefined);
    assert.equal(context.exports, undefined);
    assert.equal(context.require, undefined);
  });

  test("the only global created is TodoLogic", () => {
    assert.equal(JSON.stringify(Object.keys(load())), JSON.stringify(["TodoLogic"]));
  });

  test("constants match the Node export", () => {
    const api = load().TodoLogic;
    assert.equal(api.STORAGE_KEY, STORAGE_KEY);
    assert.equal(api.STORAGE_VERSION, STORAGE_VERSION);
    assert.equal(api.MESSAGES.blank, MESSAGES.blank);
  });

  test("a spot call works: validateText", () => {
    const api = load().TodoLogic;
    assert.equal(JSON.stringify(api.validateText("  a ")), JSON.stringify({ ok: true, text: "a" }));
    assert.equal(
      JSON.stringify(api.validateText("   ")),
      JSON.stringify({ ok: false, error: "blank" })
    );
  });

  test("a spot call works: add, serialize and restore across realms", () => {
    const api = load().TodoLogic;
    const added = api.addTask([], "  Buy milk ");
    assert.equal(added.task.text, "Buy milk");
    const restored = api.restore(api.serialize(added.tasks));
    assert.equal(
      JSON.stringify(restored),
      JSON.stringify([{ id: "t1", text: "Buy milk", completed: false }])
    );
  });

  test("a controller on a memory storage works inside the context", () => {
    const api = load().TodoLogic;
    const storage = api.createMemoryStorage();
    const controller = api.createController({ store: api.createStore({ storage: storage }) });
    controller.add("A");
    controller.add("B");
    controller.toggle("t2");
    const again = api.createController({ store: api.createStore({ storage: storage }) });
    assert.equal(
      JSON.stringify(again.getTasks()),
      JSON.stringify([
        { id: "t1", text: "A", completed: false },
        { id: "t2", text: "B", completed: true }
      ])
    );
  });

  test("resolveStorage inside the context returns null for a throwing getter", () => {
    const api = load().TodoLogic;
    assert.equal(
      api.resolveStorage(() => {
        throw new Error("denied");
      }),
      null
    );
  });

  test("the Node-realm module is the same shape as the browser-realm api", () => {
    const api = load().TodoLogic;
    assert.equal(
      JSON.stringify(Object.keys(api).sort()),
      JSON.stringify(Object.keys(logic).sort())
    );
  });
});

// ===========================================================================
// SECTION 4: source lint (T9)
// ===========================================================================

const ROOT = path.join(__dirname, "..");

function readSource(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

// Removes // and /* */ comments but leaves string and template literals intact
// (so a forbidden word inside a string is still found). Regex literals are not
// parsed; todo-logic.js has one regex literal with no quote or slash pair in it.
function stripComments(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        i += 1;
      }
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      out += " ";
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) {
        j += source[j] === "\\" ? 2 : 1;
      }
      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

const LINT_FILES = ["app.js", "todo-logic.js", "index.html", "styles.css"];
const SCRIPT_FILES = ["app.js", "todo-logic.js"];

const HTML_SINK_PATTERNS = [
  ["innerHTML", /\binnerHTML\b/],
  ["outerHTML", /\bouterHTML\b/],
  ["insertAdjacentHTML", /\binsertAdjacentHTML\b/],
  ["document.write", /\bdocument\s*\.\s*write\b/],
  ["eval", /\beval\b/]
];
const ABSOLUTE_URL = /https?:\/\//i;
const PROTOCOL_RELATIVE_URL = /["'(=]\s*\/\/[a-z0-9]/i;
const IMPORT_EXPORT_STATEMENT = /^\s*(import|export)\b/m;
const DYNAMIC_IMPORT = /\bimport\s*\(/;
const BROWSER_GLOBAL_PATTERNS = [
  ["window", /\bwindow\b/],
  ["self", /\bself\b/],
  ["document", /\bdocument\b/],
  ["localStorage", /\blocalStorage\b/]
];
const FIXED_IDS = ["add-form", "task-input", "task-error", "task-list", "empty-state"];

describe("lint: the linted files exist and are non-empty (no vacuous pass)", () => {
  for (const name of LINT_FILES) {
    test(name, () => {
      const filePath = path.join(ROOT, name);
      assert.ok(fs.existsSync(filePath), name + " exists");
      assert.ok(fs.statSync(filePath).isFile(), name + " is a file");
      assert.ok(readSource(name).trim().length > 0, name + " is not empty");
    });
  }
});

describe("lint: no HTML-string sinks in app.js and todo-logic.js (AC-10 source half, NFR-5)", () => {
  for (const name of SCRIPT_FILES) {
    for (const [label, pattern] of HTML_SINK_PATTERNS) {
      test(name + " has no " + label, () => {
        assert.equal(pattern.test(readSource(name)), false);
      });
    }
  }
});

describe("lint: no URLs in any shipped source file (NFR-1, AC-14)", () => {
  for (const name of LINT_FILES) {
    test(name + " has no http:// or https://", () => {
      assert.equal(ABSOLUTE_URL.test(readSource(name)), false);
    });
    test(name + " has no protocol-relative URL", () => {
      assert.equal(PROTOCOL_RELATIVE_URL.test(readSource(name)), false);
    });
  }
});

describe("lint: no module syntax in app.js and todo-logic.js (NFR-2, NFR-8)", () => {
  for (const name of SCRIPT_FILES) {
    test(name + " has no import or export statement", () => {
      assert.equal(IMPORT_EXPORT_STATEMENT.test(readSource(name)), false);
    });
    test(name + " has no dynamic import()", () => {
      assert.equal(DYNAMIC_IMPORT.test(readSource(name)), false);
    });
  }
});

describe("lint: todo-logic.js uses no browser globals outside comments (NFR-5)", () => {
  const stripped = stripComments(readSource("todo-logic.js"));

  test("the stripped source is still substantial", () => {
    assert.ok(stripped.length > 1000);
    assert.ok(/"use strict"/.test(stripped));
  });

  for (const [label, pattern] of BROWSER_GLOBAL_PATTERNS) {
    test("no " + label + " identifier or string", () => {
      assert.equal(pattern.test(stripped), false);
    });
  }
});

describe("lint: index.html wiring (AC-14)", () => {
  const html = readSource("index.html");

  test("no crossorigin attribute", () => {
    assert.equal(/crossorigin/i.test(html), false);
  });

  test("no type=module script, in either quote style", () => {
    assert.equal(/type\s*=\s*"module"/i.test(html), false);
    assert.equal(/type\s*=\s*'module'/i.test(html), false);
  });

  test("todo-logic.js is referenced before app.js, each exactly once", () => {
    const logicAt = html.indexOf('src="todo-logic.js"');
    const appAt = html.indexOf('src="app.js"');
    assert.ok(logicAt !== -1, "todo-logic.js script tag present");
    assert.ok(appAt !== -1, "app.js script tag present");
    assert.ok(logicAt < appAt, "todo-logic.js comes first");
    assert.equal(html.split('src="todo-logic.js"').length, 2);
    assert.equal(html.split('src="app.js"').length, 2);
  });

  for (const id of FIXED_IDS) {
    test("fixed id " + id + " is present", () => {
      assert.ok(html.includes('id="' + id + '"'));
    });
  }
});

// Returns a list of problems with a package.json text. A minimal file with
// "type": "commonjs" and no dependencies (the approved OD-3 contingency) has none.
function packageJsonProblems(text) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (error) {
    return ["not valid JSON"];
  }
  if (typeof pkg !== "object" || pkg === null || Array.isArray(pkg)) {
    return ["not a JSON object"];
  }
  const problems = [];
  if (pkg.type !== undefined && pkg.type !== "commonjs") {
    problems.push('"type" is not "commonjs": ' + JSON.stringify(pkg.type));
  }
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies"
  ]) {
    const value = pkg[field];
    if (value !== undefined && !(typeof value === "object" && value !== null && Object.keys(value).length === 0)) {
      problems.push(field + " is not empty");
    }
  }
  return problems;
}

describe("lint: repository layout (NFR-3, AC-14)", () => {
  test("test/ contains exactly todo-logic.test.js (no helper files)", () => {
    assert.equal(
      JSON.stringify(fs.readdirSync(__dirname).sort()),
      JSON.stringify(["todo-logic.test.js"])
    );
  });

  test('a root package.json, if present, has no "type": "module" and no dependencies', () => {
    const file = path.join(ROOT, "package.json");
    if (!fs.existsSync(file)) {
      assert.equal(fs.existsSync(file), false);
      return;
    }
    assert.deepEqual(packageJsonProblems(fs.readFileSync(file, "utf8")), []);
  });

  test("the package.json check rejects module type and dependencies, accepts commonjs", () => {
    assert.deepEqual(packageJsonProblems('{"private":true,"type":"commonjs"}'), []);
    assert.deepEqual(packageJsonProblems("{}"), []);
    assert.deepEqual(packageJsonProblems('{"type":"commonjs","dependencies":{}}'), []);
    assert.equal(packageJsonProblems('{"type":"module"}').length, 1);
    assert.equal(packageJsonProblems('{"type":"commonjs","dependencies":{"x":"1"}}').length, 1);
    assert.equal(packageJsonProblems('{"devDependencies":{"x":"1"}}').length, 1);
    assert.equal(packageJsonProblems("{bad").length, 1);
    assert.equal(packageJsonProblems("[]").length, 1);
  });
});

describe("lint: the lint patterns themselves catch known-bad input", () => {
  test("HTML sink patterns match bad samples and miss good ones", () => {
    const bad = {
      innerHTML: "el.innerHTML = x;",
      outerHTML: "el.outerHTML = x;",
      insertAdjacentHTML: "el.insertAdjacentHTML('beforeend', x);",
      "document.write": "document.write(x);",
      eval: "eval(x);"
    };
    for (const [label, pattern] of HTML_SINK_PATTERNS) {
      assert.equal(pattern.test(bad[label]), true, label);
      assert.equal(pattern.test("el.textContent = x; evaluate(y); retrieval();"), false, label);
    }
  });

  test("URL patterns match absolute and protocol-relative forms only", () => {
    assert.equal(ABSOLUTE_URL.test('<script src="https://cdn.example/x.js">'), true);
    assert.equal(ABSOLUTE_URL.test("url(http://example/x.png)"), true);
    assert.equal(PROTOCOL_RELATIVE_URL.test('<script src="//cdn.example/x.js">'), true);
    assert.equal(PROTOCOL_RELATIVE_URL.test("background: url(//cdn.example/x.png)"), true);
    assert.equal(PROTOCOL_RELATIVE_URL.test("var u = '//cdn.example/x.js';"), true);
    assert.equal(PROTOCOL_RELATIVE_URL.test("var a = 1; // a plain comment"), false);
    assert.equal(PROTOCOL_RELATIVE_URL.test('<link rel="icon" href="data:,">'), false);
  });

  test("import and export patterns match statements, not prose mid-line", () => {
    assert.equal(IMPORT_EXPORT_STATEMENT.test('x = 1;\nimport { a } from "./b.js";'), true);
    assert.equal(IMPORT_EXPORT_STATEMENT.test("x = 1;\n  export default x;"), true);
    assert.equal(IMPORT_EXPORT_STATEMENT.test("// we import it and export it"), false);
    assert.equal(DYNAMIC_IMPORT.test('await import("./x.js")'), true);
    assert.equal(DYNAMIC_IMPORT.test("var important = 1;"), false);
  });

  test("stripComments removes comments but keeps strings", () => {
    const source = [
      "var a = 1; // window in a line comment",
      "/* document in a",
      "   block comment */",
      'var b = "localStorage in a string";',
      "var c = 'self // not a comment';"
    ].join("\n");
    const stripped = stripComments(source);
    assert.equal(/\bwindow\b/.test(stripped), false);
    assert.equal(/\bdocument\b/.test(stripped), false);
    assert.equal(/\blocalStorage\b/.test(stripped), true);
    assert.equal(/\bself\b/.test(stripped), true);
    assert.equal(/not a comment/.test(stripped), true);
  });

  test("browser-global patterns match bad code but not substrings", () => {
    const bad = {
      window: "var w = window;",
      self: "var s = self;",
      document: "document.body",
      localStorage: "localStorage.getItem(k)"
    };
    for (const [label, pattern] of BROWSER_GLOBAL_PATTERNS) {
      assert.equal(pattern.test(bad[label]), true, label);
      assert.equal(pattern.test("var windowed = selfish + documentary + localStorageKey;"), false, label);
    }
  });
});
