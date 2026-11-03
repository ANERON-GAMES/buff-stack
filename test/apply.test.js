import assert from "node:assert/strict";
import test from "node:test";
import { applyEffect, createState, expireEffects } from "../src/index.js";
import { assertDistinct, assertFrozenResult, definition, instance, snapshot } from "./helpers.js";

const MAX = Number.MAX_SAFE_INTEGER;

test("createState returns a new frozen empty state and ignores arguments", () => {
  const left = createState();
  const right = createState(1);
  assert.deepEqual(left, { effects: [] });
  assert.deepEqual(right, left);
  assert.notEqual(left, right);
  assert.notEqual(left.effects, right.effects);
  assert.equal(Object.isFrozen(left), true);
  assert.equal(Object.isFrozen(left.effects), true);
  assert.throws(() => {
    left.effects.push(instance("haste"));
  }, TypeError);
});

test("add climbs one stack at a time and only the following call is maxed", () => {
  const effect = definition("wound", { kind: "debuff", policy: "add", maxStacks: 5, duration: 4 });
  let state = createState();
  const outcomes = [];
  for (let time = 0; time < 6; time += 1) {
    const result = applyEffect({ state, effect, time });
    outcomes.push(result.outcome);
    assert.equal(result.effects[0].stacks, Math.min(time + 1, 5));
    assert.equal(result.effects[0].appliedAt, time);
    assert.equal(result.effects[0].expiresAt, time + 4);
    assert.equal(result.effects[0].remaining, 4);
    state = result;
  }
  assert.deepEqual(outcomes, ["applied", "stacked", "stacked", "stacked", "stacked", "maxed"]);
});

test("refresh keeps a single stack even when the cap is higher", () => {
  const effect = definition("shield", { policy: "refresh", maxStacks: 5, duration: 3 });
  const first = applyEffect({ state: createState(), effect, time: 2 });
  const second = applyEffect({ state: first, effect, time: 4 });
  assert.equal(first.effects[0].stacks, 1);
  assert.equal(second.outcome, "refreshed");
  assert.equal(second.effects[0].stacks, 1);
  assert.equal(second.effects[0].maxStacks, 5);
  assert.equal(second.effects[0].expiresAt, 7);
});

test("ignore can drop a different effect in the same call without moving its own window", () => {
  const shield = instance("shield", { duration: 5, expiresAt: 5 });
  const poison = instance("poison", {
    kind: "debuff",
    policy: "ignore",
    duration: 8,
    expiresAt: 8
  });
  const result = applyEffect({
    state: { effects: [shield, poison], note: "entity" },
    effect: definition("poison", { kind: "debuff", policy: "ignore", duration: 8 }),
    time: 5
  });
  assert.equal(result.outcome, "ignored");
  assert.deepEqual(result.expired, ["shield"]);
  assert.equal(result.effects.length, 1);
  assert.equal(result.effects[0].id, "poison");
  assert.equal(result.effects[0].appliedAt, 0);
  assert.equal(result.effects[0].expiresAt, 8);
  assert.equal(result.effects[0].remaining, 3);
  assert.equal(result.effects[0].stacks, 1);
});

test("a definition may change after expiry and always starts at one stack", () => {
  const opened = applyEffect({
    state: createState(),
    effect: definition("mark", { policy: "refresh", duration: 5, maxStacks: 1 }),
    time: 0
  });
  const changed = applyEffect({
    state: opened,
    effect: definition("mark", {
      kind: "debuff",
      policy: "add",
      duration: 2,
      maxStacks: 4
    }),
    time: 5
  });
  assert.equal(changed.outcome, "applied");
  assert.deepEqual(changed.expired, ["mark"]);
  assert.equal(changed.effects[0].kind, "debuff");
  assert.equal(changed.effects[0].policy, "add");
  assert.equal(changed.effects[0].stacks, 1);
  assert.equal(changed.effects[0].maxStacks, 4);
  assert.equal(changed.effects[0].duration, 2);
  assert.equal(changed.effects[0].expiresAt, 7);
});

test("stacks on the definition are ignored and unknown fields are not copied", () => {
  let reads = 0;
  const effect = definition("haste", { policy: "add", maxStacks: 4 });
  effect.stacks = 4;
  Object.defineProperty(effect, "label", {
    enumerable: true,
    get() {
      reads += 1;
      return "x";
    }
  });
  const result = applyEffect({ state: createState(), effect, time: 0 });
  assert.equal(result.effects[0].stacks, 1);
  assert.equal(Object.hasOwn(result.effects[0], "label"), false);
  assert.equal(Object.hasOwn(result.effects[0], "remaining"), true);
  assert.equal(effect.stacks, 4);
  assert.equal(effect.maxStacks, 4);
  assert.equal(reads, 0);
});

test("ids sort by code unit and special names are ordinary ids", () => {
  const names = ["b", "__proto__", "constructor", "A", "a", " "];
  let state = createState();
  for (const id of names) {
    state = applyEffect({
      state,
      effect: definition(id, { duration: 2 }),
      time: 0
    });
  }
  assert.deepEqual(
    state.effects.map((effect) => effect.id),
    [" ", "A", "__proto__", "a", "b", "constructor"]
  );
  const again = applyEffect({
    state,
    effect: definition("A", { duration: 2 }),
    time: 1
  });
  assert.equal(again.outcome, "refreshed");
  assert.equal(again.effects[1].id, "A");
  assert.equal(again.effects[1].expiresAt, 3);
  assert.equal(again.effects[3].id, "a");
  assert.equal(again.effects[3].expiresAt, 2);
});

test("case-distinct ids and a frozen null-prototype state are accepted", () => {
  const haste = Object.create(null);
  haste.id = "Haste";
  haste.kind = "buff";
  haste.duration = 4;
  haste.maxStacks = 1;
  haste.policy = "refresh";
  const lower = Object.freeze(instance("haste", { duration: 4, expiresAt: 4 }));
  const state = Object.freeze({ effects: Object.freeze([lower]) });
  const result = applyEffect({ state, effect: Object.freeze(haste), time: 1 });
  assert.deepEqual(
    result.effects.map((effect) => effect.id),
    ["Haste", "haste"]
  );
  assert.equal(result.outcome, "applied");
  assert.equal(lower.expiresAt, 4);
  assertFrozenResult(result);
});

test("the safe integer ends are exact, and ignore does not add past the end", () => {
  const opened = applyEffect({
    state: createState(),
    effect: definition("long", { duration: MAX }),
    time: 0
  });
  assert.equal(opened.effects[0].expiresAt, MAX);
  assert.equal(opened.effects[0].remaining, MAX);
  const entry = Object.freeze(
    instance("long", { policy: "ignore", duration: MAX, appliedAt: 0, expiresAt: MAX })
  );
  const state = Object.freeze({ effects: Object.freeze([entry]) });
  const effect = Object.freeze(definition("long", { policy: "ignore", duration: MAX }));
  const ignored = applyEffect({ state, effect, time: MAX - 1 });
  assert.equal(ignored.outcome, "ignored");
  assert.equal(ignored.effects[0].expiresAt, MAX);
  assert.equal(ignored.effects[0].remaining, 1);
  assert.equal(entry.expiresAt, MAX);
  const bulk = instance("bulk", {
    policy: "add",
    stacks: MAX - 1,
    maxStacks: MAX,
    duration: 1,
    appliedAt: 0,
    expiresAt: 1
  });
  const stacked = applyEffect({
    state: { effects: [bulk] },
    effect: definition("bulk", { policy: "add", maxStacks: MAX, duration: 1 }),
    time: 0
  });
  const maxed = applyEffect({
    state: stacked,
    effect: definition("bulk", { policy: "add", maxStacks: MAX, duration: 1 }),
    time: 0
  });
  assert.equal(stacked.outcome, "stacked");
  assert.equal(stacked.effects[0].stacks, MAX);
  assert.equal(maxed.outcome, "maxed");
  assert.equal(maxed.effects[0].stacks, MAX);
});

test("a returned state round-trips, and a stale remaining value is replaced", () => {
  const first = applyEffect({ state: createState(), effect: definition("haste"), time: 0 });
  const stale = {
    time: first.time,
    outcome: first.outcome,
    expired: first.expired,
    effects: [{ ...first.effects[0], remaining: 999 }]
  };
  const next = expireEffects({ state: stale, time: 4 });
  assert.equal(next.effects[0].remaining, 6);
  assert.equal(next.effects[0].expiresAt, 10);
  assert.equal(stale.effects[0].remaining, 999);
  const copied = JSON.parse(JSON.stringify(next));
  const after = applyEffect({
    state: copied,
    effect: definition("haste"),
    time: 6
  });
  assert.equal(after.outcome, "refreshed");
  assert.equal(after.effects[0].appliedAt, 6);
  assert.equal(after.effects[0].expiresAt, 16);
  assertDistinct(next, after);
});

test("an active effect's other rows keep their stored window", () => {
  const guard = instance("guard", { duration: 9, appliedAt: 1, expiresAt: 10 });
  const result = applyEffect({
    state: { effects: [guard] },
    effect: definition("haste", { policy: "add", maxStacks: 2, duration: 3 }),
    time: 2
  });
  assert.equal(result.effects[0].id, "guard");
  assert.equal(result.effects[0].appliedAt, 1);
  assert.equal(result.effects[0].expiresAt, 10);
  assert.equal(result.effects[0].remaining, 8);
  assert.equal(result.effects[1].id, "haste");
  assert.equal(result.effects[1].stacks, 1);
  assert.equal(result.effects[1].expiresAt, 5);
  const before = snapshot(guard);
  assert.deepEqual(guard, before);
});
