import assert from "node:assert/strict";
import test from "node:test";
import { expireEffects } from "../src/index.js";
import { assertDistinct, assertFrozenResult, instance, snapshot } from "./helpers.js";

test("an effect is active until the expiry instant and gone at that instant", () => {
  const state = { effects: [instance("haste", { duration: 10, expiresAt: 10 })] };
  const held = expireEffects({ state, time: 0 });
  const edge = expireEffects({ state, time: 9 });
  const due = expireEffects({ state, time: 10 });
  assert.deepEqual(held.expired, []);
  assert.equal(held.effects[0].remaining, 10);
  assert.deepEqual(edge.expired, []);
  assert.equal(edge.effects[0].remaining, 1);
  assert.deepEqual(due.expired, ["haste"]);
  assert.equal(due.effects.length, 0);
  assert.equal(due.time, 10);
  assertFrozenResult(due);
});

test("expired ids are sorted and the surviving effect keeps its window", () => {
  const effects = [
    instance("b", { duration: 1, expiresAt: 1 }),
    instance("A", { duration: 1, expiresAt: 1 }),
    instance("a", { duration: 5, appliedAt: 0, expiresAt: 5 })
  ];
  const before = snapshot({ effects });
  const result = expireEffects({ state: { effects }, time: 1 });
  assert.deepEqual(result.expired, ["A", "b"]);
  assert.equal(result.effects.length, 1);
  assert.equal(result.effects[0].id, "a");
  assert.equal(result.effects[0].remaining, 4);
  assert.equal(result.effects[0].appliedAt, 0);
  assert.deepEqual({ effects }, before);
  const reversed = expireEffects({
    state: { effects: [effects[2], effects[0], effects[1]] },
    time: 1
  });
  assert.deepEqual(reversed, result);
  assertDistinct(reversed, result);
});

test("a query before appliedAt keeps the effect and can report a longer remaining time", () => {
  const state = {
    effects: [instance("haste", { duration: 10, appliedAt: 8, expiresAt: 18 })],
    time: 17,
    outcome: "maxed"
  };
  const early = expireEffects({ state, time: 0 });
  assert.deepEqual(early.expired, []);
  assert.equal(early.effects[0].appliedAt, 8);
  assert.equal(early.effects[0].remaining, 18);
  assert.equal(early.effects[0].duration, 10);
  assert.equal(Object.hasOwn(early, "outcome"), false);
});

test("an empty state and a state that is already clear stay empty", () => {
  const empty = expireEffects({ state: { effects: [] }, time: 4 });
  const again = expireEffects({ state: empty, time: 4 });
  assert.deepEqual(empty.expired, []);
  assert.deepEqual(empty.effects, []);
  assert.deepEqual(again.effects, []);
  assertDistinct(empty, again);
  assertFrozenResult(empty);
});

test("negative zero is stored as zero", () => {
  const result = expireEffects({
    state: {
      effects: [
        {
          id: "haste",
          kind: "buff",
          policy: "refresh",
          stacks: 1,
          maxStacks: 1,
          duration: 10,
          appliedAt: -0,
          expiresAt: 10
        }
      ]
    },
    time: -0
  });
  assert.equal(Object.is(result.time, 0), true);
  assert.equal(Object.is(result.effects[0].appliedAt, 0), true);
  assert.equal(Object.is(result.effects[0].remaining, 10), true);
  assert.equal(Object.is(result.effects[0].stacks, -0), false);
});

test("integer-valued numbers and a hand-built add stack are accepted", () => {
  const result = expireEffects({
    state: {
      effects: [
        {
          id: "wound",
          kind: "debuff",
          policy: "add",
          stacks: 2.0,
          maxStacks: 3.0,
          duration: 5.0,
          appliedAt: 1.0,
          expiresAt: 6.0
        }
      ]
    },
    time: 2.0
  });
  assert.equal(result.effects[0].stacks, 2);
  assert.equal(result.effects[0].remaining, 4);
  assert.equal(result.effects[0].kind, "debuff");
});
