import { ApplyOutcome, StackPolicy } from "./constants.js";
import { readApply, readExpire, readRemove } from "./read.js";

const KIND_MATCH_MESSAGE = "effect kind must match the active effect";
const DURATION_MATCH_MESSAGE = "effect duration must match the active effect";
const MAX_STACKS_MATCH_MESSAGE = "effect maxStacks must match the active effect";
const POLICY_MATCH_MESSAGE = "effect policy must match the active effect";
const EXPIRES_MESSAGE = "expiresAt must be a safe integer";

export function createState() {
  return Object.freeze({
    effects: Object.freeze([])
  });
}

export function applyEffect(options) {
  const input = readApply(options);
  const parts = split(input.effects, input.time);
  const index = findId(parts.active, input.effect.id);
  if (index === -1) {
    const expiresAt = addDuration(input.time, input.effect.duration);
    parts.active.push(startEffect(input.effect, input.time, expiresAt));
    return finishApply(input.time, ApplyOutcome.Applied, parts.expired, parts.active);
  }
  const current = parts.active[index];
  assertSameDefinition(current, input.effect);
  if (current.policy === StackPolicy.Ignore) {
    return finishApply(input.time, ApplyOutcome.Ignored, parts.expired, parts.active);
  }
  const expiresAt = addDuration(input.time, current.duration);
  if (current.policy === StackPolicy.Refresh) {
    parts.active[index] = restart(current, input.time, expiresAt, current.stacks);
    return finishApply(input.time, ApplyOutcome.Refreshed, parts.expired, parts.active);
  }
  if (current.stacks < current.maxStacks) {
    parts.active[index] = restart(current, input.time, expiresAt, current.stacks + 1);
    return finishApply(input.time, ApplyOutcome.Stacked, parts.expired, parts.active);
  }
  parts.active[index] = restart(current, input.time, expiresAt, current.stacks);
  return finishApply(input.time, ApplyOutcome.Maxed, parts.expired, parts.active);
}

export function expireEffects(options) {
  const input = readExpire(options);
  const parts = split(input.effects, input.time);
  return finishSweep(input.time, parts.expired, parts.active);
}

export function removeEffect(options) {
  const input = readRemove(options);
  const parts = split(input.effects, input.time);
  const active = [];
  let removed = false;
  for (const effect of parts.active) {
    if (effect.id === input.id) {
      removed = true;
      continue;
    }
    active.push(effect);
  }
  return Object.freeze({
    time: input.time,
    removed,
    expired: Object.freeze(sortedIds(parts.expired)),
    effects: freezeEffects(presentSorted(active, input.time))
  });
}

function split(effects, time) {
  const active = [];
  const expired = [];
  for (const effect of effects) {
    if (effect.expiresAt <= time) {
      expired.push(effect);
    } else {
      active.push(effect);
    }
  }
  return { active, expired };
}

function findId(effects, id) {
  for (let index = 0; index < effects.length; index += 1) {
    if (effects[index].id === id) {
      return index;
    }
  }
  return -1;
}

function assertSameDefinition(current, effect) {
  if (current.kind !== effect.kind) {
    throw new TypeError(KIND_MATCH_MESSAGE);
  }
  if (current.duration !== effect.duration) {
    throw new RangeError(DURATION_MATCH_MESSAGE);
  }
  if (current.maxStacks !== effect.maxStacks) {
    throw new RangeError(MAX_STACKS_MATCH_MESSAGE);
  }
  if (current.policy !== effect.policy) {
    throw new TypeError(POLICY_MATCH_MESSAGE);
  }
}

function addDuration(time, duration) {
  if (duration > Number.MAX_SAFE_INTEGER - time) {
    throw new RangeError(EXPIRES_MESSAGE);
  }
  return time + duration;
}

function startEffect(effect, time, expiresAt) {
  return {
    id: effect.id,
    kind: effect.kind,
    policy: effect.policy,
    stacks: 1,
    maxStacks: effect.maxStacks,
    duration: effect.duration,
    appliedAt: time,
    expiresAt
  };
}

function restart(current, time, expiresAt, stacks) {
  return {
    id: current.id,
    kind: current.kind,
    policy: current.policy,
    stacks,
    maxStacks: current.maxStacks,
    duration: current.duration,
    appliedAt: time,
    expiresAt
  };
}

function finishApply(time, outcome, expired, active) {
  return Object.freeze({
    time,
    outcome,
    expired: Object.freeze(sortedIds(expired)),
    effects: freezeEffects(presentSorted(active, time))
  });
}

function finishSweep(time, expired, active) {
  return Object.freeze({
    time,
    expired: Object.freeze(sortedIds(expired)),
    effects: freezeEffects(presentSorted(active, time))
  });
}

function presentSorted(effects, time) {
  const ordered = effects.slice();
  ordered.sort(compareEffect);
  const presented = [];
  for (const effect of ordered) {
    presented.push(present(effect, time));
  }
  return presented;
}

function present(effect, time) {
  return {
    id: effect.id,
    kind: effect.kind,
    policy: effect.policy,
    stacks: effect.stacks,
    maxStacks: effect.maxStacks,
    duration: effect.duration,
    appliedAt: effect.appliedAt,
    expiresAt: effect.expiresAt,
    remaining: effect.expiresAt - time
  };
}

function sortedIds(effects) {
  const ids = [];
  for (const effect of effects) {
    ids.push(effect.id);
  }
  ids.sort(compareString);
  return ids;
}

function compareEffect(left, right) {
  return compareString(left.id, right.id);
}

function compareString(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function freezeEffects(effects) {
  const frozen = [];
  for (const effect of effects) {
    frozen.push(Object.freeze(effect));
  }
  return Object.freeze(frozen);
}
