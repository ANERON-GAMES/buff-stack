import assert from "node:assert/strict";
import test from "node:test";
import { removeEffect } from "../src/index.js";
import { assertDistinct, assertFrozenResult, instance, snapshot } from "./helpers.js";

test("remove drops one active id and leaves the others in id order", () => {
  const effects = [
    instance("b", { duration: 5, expiresAt: 5 }),
    instance("A", { duration: 5, expiresAt: 5 }),
    instance("a", { duration: 5, expiresAt: 5 })
  ];
  const before = snapshot({ effects });
  const result = removeEffect({ state: { effects }, id: "a", time: 1 });
  assert.equal(result.removed, true);
  assert.deepEqual(result.expired, []);
  assert.deepEqual(
    result.effects.map((effect) => effect.id),
    ["A", "b"]
  );
  assert.equal(result.effects[0].remaining, 4);
  assert.equal(result.effects[1].remaining, 4);
  assert.deepEqual({ effects }, before);
  assertFrozenResult(result);
  const again = removeEffect({ state: { effects }, id: "a", time: 1 });
  assert.deepEqual(again, result);
  assertDistinct(again, result);
});

test("an expired id is reported as expired and is not counted as removed", () => {
  const state = {
    effects: [
      instance("poison", { kind: "debuff", duration: 4, expiresAt: 4 }),
      instance("shield", { duration: 9, expiresAt: 9 })
    ]
  };
  const result = removeEffect({ state, id: "poison", time: 4 });
  assert.equal(result.removed, false);
  assert.deepEqual(result.expired, ["poison"]);
  assert.equal(result.effects.length, 1);
  assert.equal(result.effects[0].id, "shield");
  assert.equal(result.effects[0].remaining, 5);
  assert.equal(result.effects[0].appliedAt, 0);
});

test("an unknown id removes nothing and still sweeps expiry", () => {
  const state = {
    effects: [instance("haste"), instance("mark", { duration: 2, expiresAt: 2 })]
  };
  const result = removeEffect({ state, id: "missing", time: 3 });
  assert.equal(result.removed, false);
  assert.deepEqual(result.expired, ["mark"]);
  assert.equal(result.effects.length, 1);
  assert.equal(result.effects[0].id, "haste");
  assert.equal(result.effects[0].remaining, 7);
  const absent = removeEffect({ state: { effects: [] }, id: " ", time: 0 });
  assert.equal(absent.removed, false);
  assert.deepEqual(absent.effects, []);
  const space = removeEffect({
    state: { effects: [instance(" ")] },
    id: " ",
    time: 0
  });
  assert.equal(space.removed, true);
  assert.equal(space.effects.length, 0);
});

test("Haste and haste are different ids", () => {
  const state = {
    effects: [instance("haste"), instance("Haste")]
  };
  const result = removeEffect({ state, id: "Haste", time: 0 });
  assert.equal(result.removed, true);
  assert.deepEqual(
    result.effects.map((effect) => effect.id),
    ["haste"]
  );
});

test("a no-op removal still returns new objects", () => {
  const state = { effects: [instance("haste", { duration: 4, expiresAt: 4 })] };
  const result = removeEffect({ state, id: "other", time: 1 });
  assert.equal(result.removed, false);
  assert.equal(result.effects[0].remaining, 3);
  assert.notEqual(result.effects[0], state.effects[0]);
  assert.notEqual(result.effects, state.effects);
  assert.equal(state.effects[0].expiresAt, 4);
});
