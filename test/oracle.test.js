import assert from "node:assert/strict";
import test from "node:test";
import { applyEffect, createState, expireEffects, removeEffect } from "../src/index.js";
import { runOracle } from "./oracle.js";

const haste = { id: "haste", kind: "buff", duration: 10, maxStacks: 3, policy: "add" };
const shield = { id: "shield", kind: "buff", duration: 5, maxStacks: 1, policy: "refresh" };
const poison = { id: "poison", kind: "debuff", duration: 8, maxStacks: 2, policy: "ignore" };
const alpha = { id: "A", kind: "buff", duration: 4, maxStacks: 1, policy: "refresh" };
const lower = { id: "a", kind: "debuff", duration: 6, maxStacks: 4, policy: "add" };
const beta = { id: "b", kind: "buff", duration: 3, maxStacks: 1, policy: "ignore" };

const steps = [
  { op: "apply", effect: beta, time: 0 },
  { op: "apply", effect: lower, time: 0 },
  { op: "apply", effect: alpha, time: 0 },
  { op: "apply", effect: haste, time: 1 },
  { op: "apply", effect: haste, time: 2 },
  { op: "apply", effect: shield, time: 2 },
  { op: "apply", effect: poison, time: 2 },
  { op: "apply", effect: poison, time: 3 },
  { op: "apply", effect: lower, time: 3 },
  { op: "expire", time: 3 },
  { op: "remove", id: "a", time: 4 },
  { op: "apply", effect: shield, time: 4 },
  { op: "expire", time: 5 },
  { op: "apply", effect: haste, time: 6 },
  { op: "apply", effect: haste, time: 7 },
  { op: "expire", time: 1 },
  { op: "apply", effect: beta, time: 3 },
  { op: "remove", id: "missing", time: 4 },
  { op: "apply", effect: beta, time: 6 },
  { op: "expire", time: 20 }
];

function project(result) {
  const projected = {
    time: result.time,
    expired: result.expired,
    effects: result.effects
  };
  if (Object.hasOwn(result, "outcome")) {
    projected.outcome = result.outcome;
  }
  if (Object.hasOwn(result, "removed")) {
    projected.removed = result.removed;
  }
  return projected;
}

test("a script of applies, expiries, and removals matches an independent model", () => {
  let state = createState();
  const actual = [];
  for (const step of steps) {
    let result;
    if (step.op === "apply") {
      result = applyEffect({ state, effect: step.effect, time: step.time });
    } else if (step.op === "remove") {
      result = removeEffect({ state, id: step.id, time: step.time });
    } else {
      result = expireEffects({ state, time: step.time });
    }
    actual.push(project(result));
    state = result;
  }
  assert.deepEqual(actual, runOracle(steps));
  assert.equal(actual[2].effects.map((effect) => effect.id).join(","), "A,a,b");
  assert.equal(actual[actual.length - 1].effects.length, 0);
  assert.equal(actual[14].outcome, "maxed");
});
