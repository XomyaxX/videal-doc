import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignSortOrders,
  edgeWouldCycle,
  hasSameLink,
  isAssignableEmployee,
  normalizeLink,
  stableTopo,
} from "./work-board-graph";

describe("связи доски", () => {
  it("не даёт связать задачу саму с собой", () => {
    assert.equal(edgeWouldCycle([], "a", "a"), true);
  });

  it("разрешает первую связь", () => {
    assert.equal(edgeWouldCycle([], "a", "b"), false);
  });

  it("ловит прямой цикл", () => {
    assert.equal(edgeWouldCycle([{ fromId: "a", toId: "b" }], "b", "a"), true);
  });

  it("ловит цикл через цепочку", () => {
    const edges = [
      { fromId: "a", toId: "b" },
      { fromId: "b", toId: "c" },
    ];
    assert.equal(edgeWouldCycle(edges, "c", "a"), true);
    assert.equal(edgeWouldCycle(edges, "a", "c"), false);
  });

  it("не путает параллельные ветки с циклом", () => {
    const edges = [
      { fromId: "a", toId: "b" },
      { fromId: "a", toId: "c" },
    ];
    assert.equal(edgeWouldCycle(edges, "b", "c"), false);
  });

  it("видит уже существующую такую же связь", () => {
    assert.equal(hasSameLink([{ fromId: "a", toId: "b" }], "a", "b"), true);
    assert.equal(hasSameLink([{ fromId: "a", toId: "b" }], "b", "a"), false);
  });

  it("«блокирует» и «дальше» сохраняют направление жеста", () => {
    assert.deepEqual(normalizeLink("blocks", "a", "b"), { fromId: "a", toId: "b" });
    assert.deepEqual(normalizeLink("sequence", "a", "b"), { fromId: "a", toId: "b" });
  });

  it("«зависит от» ставит цель раньше источника", () => {
    assert.deepEqual(normalizeLink("depends", "card", "needed"), { fromId: "needed", toId: "card" });
  });
});

describe("порядок", () => {
  it("без связей оставляет прежний порядок", () => {
    const tasks = [
      { id: "b", sortOrder: 10 },
      { id: "a", sortOrder: 20 },
    ];
    assert.deepEqual(stableTopo(tasks, []), ["b", "a"]);
  });

  it("выстраивает цепочку даже если номера были наоборот", () => {
    const tasks = [
      { id: "c", sortOrder: 10 },
      { id: "b", sortOrder: 20 },
      { id: "a", sortOrder: 30 },
    ];
    const edges = [
      { fromId: "a", toId: "b" },
      { fromId: "b", toId: "c" },
    ];
    assert.deepEqual(stableTopo(tasks, edges), ["a", "b", "c"]);
  });

  it("возвращает null, если цикл уже в данных", () => {
    const tasks = [
      { id: "a", sortOrder: 10 },
      { id: "b", sortOrder: 20 },
    ];
    const edges = [
      { fromId: "a", toId: "b" },
      { fromId: "b", toId: "a" },
    ];
    assert.equal(stableTopo(tasks, edges), null);
  });

  it("раздаёт шаг 10", () => {
    const orders = assignSortOrders(["a", "b", "c"]);
    assert.deepEqual([...orders.values()], [10, 20, 30]);
  });
});

describe("исполнители", () => {
  it("исключает уволенных и удалённых", () => {
    assert.equal(isAssignableEmployee({ status: "active", deletedAt: null }), true);
    assert.equal(isAssignableEmployee({ status: "dismissed", deletedAt: null }), false);
    assert.equal(isAssignableEmployee({ status: "active", deletedAt: "2026-01-01" }), false);
    assert.equal(isAssignableEmployee({ status: "dismissed", deletedAt: new Date() }), false);
  });
});
