import assert from "node:assert/strict";

export function definition(id, extra = {}) {
  return {
    id,
    kind: "buff",
    duration: 10,
    maxStacks: 1,
    policy: "refresh",
    ...extra
  };
}

export function instance(id, extra = {}) {
  const duration = extra.duration ?? 10;
  const appliedAt = extra.appliedAt ?? 0;
  const maxStacks = extra.maxStacks ?? 1;
  const stacks = extra.stacks ?? 1;
  return {
    id,
    kind: extra.kind ?? "buff",
    policy: extra.policy ?? "refresh",
    stacks,
    maxStacks,
    duration,
    appliedAt,
    expiresAt: extra.expiresAt ?? appliedAt + duration
  };
}

export function stateOf(effects) {
  return { effects };
}

export function assertFrozenResult(result) {
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.expired), true);
  assert.equal(Object.isFrozen(result.effects), true);
  for (const effect of result.effects) {
    assert.equal(Object.isFrozen(effect), true);
  }
}

export function assertDistinct(left, right) {
  assert.notEqual(left, right);
  assert.notEqual(left.effects, right.effects);
  assert.notEqual(left.expired, right.expired);
  const count = Math.min(left.effects.length, right.effects.length);
  for (let index = 0; index < count; index += 1) {
    assert.notEqual(left.effects[index], right.effects[index]);
  }
}

export function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}
