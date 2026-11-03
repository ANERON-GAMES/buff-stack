import { EffectKind, StackPolicy } from "./constants.js";
import { isObject, normalizeZero } from "./shape.js";

const OPTIONS_MESSAGE = "options must be an object";
const STATE_MESSAGE = "state must be an object";
const EFFECTS_MESSAGE = "effects must be an array";
const EFFECT_MESSAGE = "effect must be an object";
const EFFECT_ID_MESSAGE = "effect id must be a non-empty string";
const UNIQUE_MESSAGE = "effect ids must be unique";
const KIND_MESSAGE = "effect kind must be buff or debuff";
const DURATION_MESSAGE = "duration must be an integer greater than or equal to 1";
const MAX_STACKS_MESSAGE = "maxStacks must be an integer greater than or equal to 1";
const POLICY_MESSAGE = "policy must be refresh, add, or ignore";
const STACKS_MESSAGE =
  "stacks must be an integer greater than or equal to 1 and less than or equal to maxStacks";
const STACKS_POLICY_MESSAGE = "stacks must be 1 when policy is not add";
const APPLIED_AT_MESSAGE = "appliedAt must be an integer greater than or equal to 0";
const EXPIRES_AT_MESSAGE = "expiresAt must be an integer greater than or equal to 0";
const WINDOW_MESSAGE = "expiresAt must equal appliedAt plus duration";
const TIME_MESSAGE = "time must be an integer greater than or equal to 0";
const ID_MESSAGE = "id must be a non-empty string";

export function readApply(options) {
  if (!isObject(options)) {
    throw new TypeError(OPTIONS_MESSAGE);
  }
  const effects = readEffects(options);
  const effect = readDefinition(options);
  const time = readTime(options);
  return { effects, effect, time };
}

export function readExpire(options) {
  if (!isObject(options)) {
    throw new TypeError(OPTIONS_MESSAGE);
  }
  const effects = readEffects(options);
  const time = readTime(options);
  return { effects, time };
}

export function readRemove(options) {
  if (!isObject(options)) {
    throw new TypeError(OPTIONS_MESSAGE);
  }
  const effects = readEffects(options);
  const id = readRemoveId(options);
  const time = readTime(options);
  return { effects, id, time };
}

function readEffects(options) {
  if (!Object.hasOwn(options, "state") || !isObject(options.state)) {
    throw new TypeError(STATE_MESSAGE);
  }
  const state = options.state;
  if (!Object.hasOwn(state, "effects") || !Array.isArray(state.effects)) {
    throw new TypeError(EFFECTS_MESSAGE);
  }
  const seen = new Map();
  const effects = [];
  for (const entry of state.effects) {
    effects.push(readInstance(entry, seen));
  }
  return effects;
}

function readInstance(entry, seen) {
  if (!isObject(entry)) {
    throw new TypeError(EFFECT_MESSAGE);
  }
  const id = readEffectId(entry);
  if (seen.has(id)) {
    throw new TypeError(UNIQUE_MESSAGE);
  }
  seen.set(id, true);
  const kind = readKind(entry);
  const duration = readDuration(entry);
  const maxStacks = readMaxStacks(entry);
  const policy = readPolicy(entry);
  const stacks = readStacks(entry, maxStacks);
  if (policy !== StackPolicy.Add && stacks !== 1) {
    throw new RangeError(STACKS_POLICY_MESSAGE);
  }
  const appliedAt = readAppliedAt(entry);
  const expiresAt = readExpiresAt(entry);
  assertWindow(appliedAt, duration, expiresAt);
  return { id, kind, policy, stacks, maxStacks, duration, appliedAt, expiresAt };
}

function readDefinition(options) {
  if (!Object.hasOwn(options, "effect") || !isObject(options.effect)) {
    throw new TypeError(EFFECT_MESSAGE);
  }
  const effect = options.effect;
  const id = readEffectId(effect);
  const kind = readKind(effect);
  const duration = readDuration(effect);
  const maxStacks = readMaxStacks(effect);
  const policy = readPolicy(effect);
  return { id, kind, policy, maxStacks, duration };
}

function readEffectId(source) {
  if (!Object.hasOwn(source, "id") || typeof source.id !== "string" || source.id.length === 0) {
    throw new TypeError(EFFECT_ID_MESSAGE);
  }
  return source.id;
}

function readKind(source) {
  if (!Object.hasOwn(source, "kind") || !isKind(source.kind)) {
    throw new TypeError(KIND_MESSAGE);
  }
  return source.kind;
}

function readDuration(source) {
  return readRequiredMinimum(source, "duration", 1, DURATION_MESSAGE);
}

function readMaxStacks(source) {
  return readRequiredMinimum(source, "maxStacks", 1, MAX_STACKS_MESSAGE);
}

function readPolicy(source) {
  if (!Object.hasOwn(source, "policy") || !isPolicy(source.policy)) {
    throw new TypeError(POLICY_MESSAGE);
  }
  return source.policy;
}

function readStacks(source, maxStacks) {
  const stacks = readRequiredMinimum(source, "stacks", 1, STACKS_MESSAGE);
  if (stacks > maxStacks) {
    throw new RangeError(STACKS_MESSAGE);
  }
  return stacks;
}

function readAppliedAt(source) {
  return readRequiredMinimum(source, "appliedAt", 0, APPLIED_AT_MESSAGE);
}

function readExpiresAt(source) {
  return readRequiredMinimum(source, "expiresAt", 0, EXPIRES_AT_MESSAGE);
}

function readTime(options) {
  return readRequiredMinimum(options, "time", 0, TIME_MESSAGE);
}

function readRemoveId(options) {
  if (!Object.hasOwn(options, "id") || typeof options.id !== "string" || options.id.length === 0) {
    throw new TypeError(ID_MESSAGE);
  }
  return options.id;
}

function readRequiredMinimum(source, key, minimum, message) {
  if (!Object.hasOwn(source, key)) {
    throw new RangeError(message);
  }
  return readMinimum(source[key], minimum, message);
}

function readMinimum(value, minimum, message) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(message);
  }
  return normalizeZero(value);
}

function assertWindow(appliedAt, duration, expiresAt) {
  if (duration > Number.MAX_SAFE_INTEGER - appliedAt || appliedAt + duration !== expiresAt) {
    throw new RangeError(WINDOW_MESSAGE);
  }
}

function isKind(value) {
  return value === EffectKind.Buff || value === EffectKind.Debuff;
}

function isPolicy(value) {
  return value === StackPolicy.Refresh || value === StackPolicy.Add || value === StackPolicy.Ignore;
}
