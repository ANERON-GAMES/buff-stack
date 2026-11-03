import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplyOutcome,
  EffectKind,
  StackPolicy,
  applyEffect,
  createState,
  expireEffects,
  removeEffect
} from "../src/index.js";
import { assertDistinct, assertFrozenResult } from "./helpers.js";

const haste = {
  id: "haste",
  kind: "buff",
  duration: 10,
  maxStacks: 3,
  policy: "add"
};

const shield = {
  id: "shield",
  kind: "buff",
  duration: 5,
  maxStacks: 1,
  policy: "refresh"
};

const poison = {
  id: "poison",
  kind: "debuff",
  duration: 8,
  maxStacks: 1,
  policy: "ignore"
};

test("haste stacks to the cap, refreshes there, and starts over at expiry", () => {
  const first = applyEffect({ state: createState(), effect: haste, time: 0 });
  const second = applyEffect({ state: first, effect: haste, time: 4 });
  const third = applyEffect({ state: second, effect: haste, time: 6 });
  const fourth = applyEffect({ state: third, effect: haste, time: 8 });
  const still = expireEffects({ state: fourth, time: 17 });
  const faded = expireEffects({ state: fourth, time: 18 });
  const restarted = applyEffect({ state: fourth, effect: haste, time: 18 });

  assert.equal(first.outcome, ApplyOutcome.Applied);
  assert.equal(first.time, 0);
  assert.deepEqual(first.expired, []);
  assert.equal(first.effects[0].id, "haste");
  assert.equal(first.effects[0].kind, EffectKind.Buff);
  assert.equal(first.effects[0].policy, StackPolicy.Add);
  assert.equal(first.effects[0].stacks, 1);
  assert.equal(first.effects[0].maxStacks, 3);
  assert.equal(first.effects[0].duration, 10);
  assert.equal(first.effects[0].appliedAt, 0);
  assert.equal(first.effects[0].expiresAt, 10);
  assert.equal(first.effects[0].remaining, 10);

  assert.equal(second.outcome, "stacked");
  assert.equal(second.effects[0].stacks, 2);
  assert.equal(second.effects[0].appliedAt, 4);
  assert.equal(second.effects[0].expiresAt, 14);
  assert.equal(second.effects[0].remaining, 10);

  assert.equal(third.outcome, "stacked");
  assert.equal(third.effects[0].stacks, 3);
  assert.equal(third.effects[0].appliedAt, 6);
  assert.equal(third.effects[0].expiresAt, 16);

  assert.equal(fourth.outcome, "maxed");
  assert.equal(fourth.effects[0].stacks, 3);
  assert.equal(fourth.effects[0].appliedAt, 8);
  assert.equal(fourth.effects[0].expiresAt, 18);
  assert.equal(fourth.effects[0].remaining, 10);

  assert.deepEqual(still.expired, []);
  assert.equal(still.effects[0].remaining, 1);
  assert.equal(still.effects[0].expiresAt, 18);

  assert.deepEqual(faded.expired, ["haste"]);
  assert.equal(faded.effects.length, 0);

  assert.equal(restarted.outcome, "applied");
  assert.deepEqual(restarted.expired, ["haste"]);
  assert.equal(restarted.effects[0].stacks, 1);
  assert.equal(restarted.effects[0].appliedAt, 18);
  assert.equal(restarted.effects[0].expiresAt, 28);
  assertFrozenResult(restarted);
});

test("refresh restarts a shield and ignore leaves poison on its original window", () => {
  const opened = applyEffect({ state: createState(), effect: shield, time: 0 });
  const renewed = applyEffect({ state: opened, effect: shield, time: 4 });
  const inflicted = applyEffect({ state: createState(), effect: poison, time: 2 });
  const resisted = applyEffect({ state: inflicted, effect: poison, time: 5 });

  assert.equal(opened.effects[0].expiresAt, 5);
  assert.equal(renewed.outcome, "refreshed");
  assert.equal(renewed.effects[0].stacks, 1);
  assert.equal(renewed.effects[0].appliedAt, 4);
  assert.equal(renewed.effects[0].expiresAt, 9);
  assert.equal(renewed.effects[0].remaining, 5);

  assert.equal(inflicted.effects[0].expiresAt, 10);
  assert.equal(resisted.outcome, "ignored");
  assert.equal(resisted.effects[0].stacks, 1);
  assert.equal(resisted.effects[0].appliedAt, 2);
  assert.equal(resisted.effects[0].expiresAt, 10);
  assert.equal(resisted.effects[0].remaining, 5);
  assert.equal(resisted.effects[0].kind, "debuff");
});

test("one entity keeps a buff and a debuff, ordered by id, until each expiry", () => {
  const withShield = applyEffect({ state: createState(), effect: shield, time: 0 });
  const withPoison = applyEffect({ state: withShield, effect: poison, time: 1 });
  const refreshed = applyEffect({ state: withPoison, effect: shield, time: 3 });
  const swept = expireEffects({ state: refreshed, time: 8 });
  const gone = expireEffects({ state: swept, time: 9 });
  const again = applyEffect({ state: withShield, effect: shield, time: 5 });
  const dispelled = removeEffect({ state: withPoison, id: "poison", time: 2 });

  assert.equal(refreshed.outcome, "refreshed");
  assert.equal(refreshed.effects[0].id, "poison");
  assert.equal(refreshed.effects[0].expiresAt, 9);
  assert.equal(refreshed.effects[0].remaining, 6);
  assert.equal(refreshed.effects[1].id, "shield");
  assert.equal(refreshed.effects[1].appliedAt, 3);
  assert.equal(refreshed.effects[1].expiresAt, 8);
  assert.equal(refreshed.effects[1].remaining, 5);
  assert.equal(refreshed.effects[1].stacks, 1);

  assert.deepEqual(swept.expired, ["shield"]);
  assert.equal(swept.effects.length, 1);
  assert.equal(swept.effects[0].id, "poison");
  assert.equal(swept.effects[0].remaining, 1);

  assert.deepEqual(gone.expired, ["poison"]);
  assert.equal(gone.effects.length, 0);

  assert.equal(again.outcome, "applied");
  assert.deepEqual(again.expired, ["shield"]);
  assert.equal(again.effects[0].stacks, 1);
  assert.equal(again.effects[0].appliedAt, 5);
  assert.equal(again.effects[0].expiresAt, 10);
  assert.equal(again.effects[0].remaining, 5);

  assert.equal(dispelled.removed, true);
  assert.equal(dispelled.expired.length, 0);
  assert.equal(dispelled.effects.length, 1);
  assert.equal(dispelled.effects[0].id, "shield");
  assert.equal(dispelled.effects[0].remaining, 3);
  assert.equal(dispelled.effects[0].expiresAt, 5);
});

test("inputs stay unchanged and a dropped effect is not restored by an earlier time", () => {
  const snapshot = createState();
  const shieldCopy = { ...shield };
  applyEffect({ state: snapshot, effect: shieldCopy, time: 0 });
  assert.equal(snapshot.effects.length, 0);
  assert.equal(shieldCopy.maxStacks, 1);
  assert.equal(Object.hasOwn(shieldCopy, "stacks"), false);

  const fourth = applyEffect({
    state: applyEffect({
      state: applyEffect({
        state: applyEffect({ state: createState(), effect: haste, time: 0 }),
        effect: haste,
        time: 4
      }),
      effect: haste,
      time: 6
    }),
    effect: haste,
    time: 8
  });
  const still = expireEffects({ state: fourth, time: 17 });
  const faded = expireEffects({ state: fourth, time: 18 });
  const rewound = expireEffects({ state: still, time: 8 });
  const early = expireEffects({ state: fourth, time: 0 });
  const lost = expireEffects({ state: faded, time: 8 });

  assert.equal(rewound.expired.length, 0);
  assert.equal(rewound.effects[0].remaining, 10);
  assert.equal(rewound.effects[0].expiresAt, 18);
  assert.deepEqual(early.expired, []);
  assert.equal(early.effects[0].appliedAt, 8);
  assert.equal(early.effects[0].remaining, 18);
  assert.equal(lost.effects.length, 0);
  assert.equal(fourth.effects[0].remaining, 10);
});

test("repeated calls with the same input return equal values and distinct objects", () => {
  const state = createState();
  const left = applyEffect({ state, effect: haste, time: 0 });
  const right = applyEffect({ state, effect: haste, time: 0 });
  assert.deepEqual(left, right);
  assertDistinct(left, right);
  assert.notEqual(left.effects[0], state.effects);
  const sweptLeft = expireEffects({ state: left, time: 3 });
  const sweptRight = expireEffects({ state: left, time: 3 });
  assert.deepEqual(sweptLeft, sweptRight);
  assertDistinct(sweptLeft, sweptRight);
  assertFrozenResult(left);
  assert.throws(() => {
    left.effects.push({});
  }, TypeError);
  assert.throws(() => {
    left.effects[0].stacks = 9;
  }, TypeError);
  assert.throws(() => {
    left.expired.push("x");
  }, TypeError);
});
