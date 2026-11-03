import assert from "node:assert/strict";
import test from "node:test";
import { applyEffect, expireEffects, removeEffect } from "../src/index.js";
import { definition, instance } from "./helpers.js";

const OPTIONS = "options must be an object";
const STATE = "state must be an object";
const EFFECTS = "effects must be an array";
const EFFECT = "effect must be an object";
const EFFECT_ID = "effect id must be a non-empty string";
const UNIQUE = "effect ids must be unique";
const KIND = "effect kind must be buff or debuff";
const DURATION = "duration must be an integer greater than or equal to 1";
const MAX_STACKS = "maxStacks must be an integer greater than or equal to 1";
const POLICY = "policy must be refresh, add, or ignore";
const STACKS =
  "stacks must be an integer greater than or equal to 1 and less than or equal to maxStacks";
const STACKS_POLICY = "stacks must be 1 when policy is not add";
const APPLIED_AT = "appliedAt must be an integer greater than or equal to 0";
const EXPIRES_AT = "expiresAt must be an integer greater than or equal to 0";
const WINDOW = "expiresAt must equal appliedAt plus duration";
const TIME = "time must be an integer greater than or equal to 0";
const ID = "id must be a non-empty string";
const KIND_MATCH = "effect kind must match the active effect";
const DURATION_MATCH = "effect duration must match the active effect";
const MAX_STACKS_MATCH = "effect maxStacks must match the active effect";
const POLICY_MATCH = "effect policy must match the active effect";
const EXPIRES = "expiresAt must be a safe integer";

const MAX = Number.MAX_SAFE_INTEGER;
const calls = [applyEffect, expireEffects, removeEffect];

function rejects(fn, name, message) {
  assert.throws(fn, { name, message });
}

function validEffect(extra = {}) {
  return definition("haste", extra);
}

test("every call rejects a bad options object before it reads fields", () => {
  for (const fn of calls) {
    rejects(() => fn(), "TypeError", OPTIONS);
    for (const options of [undefined, null, [], "state", 1, true, false, () => {}]) {
      rejects(() => fn(options), "TypeError", OPTIONS);
    }
  }
});

test("state is checked before effects, the definition, the id, and time", () => {
  const bad = { state: null, effect: null, id: "", time: -1 };
  for (const fn of calls) {
    rejects(() => fn(bad), "TypeError", STATE);
    rejects(() => fn({ effect: validEffect(), id: "haste", time: 0 }), "TypeError", STATE);
    rejects(
      () => fn({ state: [], effect: validEffect(), id: "haste", time: 0 }),
      "TypeError",
      STATE
    );
    rejects(
      () => fn({ state: "entity", effect: validEffect(), id: "haste", time: 0 }),
      "TypeError",
      STATE
    );
  }
  const inherited = Object.create({
    state: { effects: [] }
  });
  inherited.effect = validEffect();
  inherited.id = "haste";
  inherited.time = 0;
  for (const fn of calls) {
    rejects(() => fn(inherited), "TypeError", STATE);
  }
});

test("effects are checked before later fields, including a hole and a bad entry", () => {
  const badEffect = { state: { effects: null }, effect: null, id: "", time: -1 };
  for (const fn of calls) {
    rejects(() => fn(badEffect), "TypeError", EFFECTS);
    rejects(
      () => fn({ state: {}, effect: validEffect(), id: "haste", time: 0 }),
      "TypeError",
      EFFECTS
    );
    rejects(
      () => fn({ state: { effects: {} }, effect: validEffect(), id: "haste", time: 0 }),
      "TypeError",
      EFFECTS
    );
    rejects(
      () => fn({ state: { effects: [null] }, effect: null, id: "", time: -1 }),
      "TypeError",
      EFFECT
    );
    rejects(
      () => fn({ state: { effects: [[]] }, effect: validEffect(), id: "haste", time: 0 }),
      "TypeError",
      EFFECT
    );
  }
  const state = Object.create({ effects: [] });
  rejects(() => applyEffect({ state, effect: validEffect(), time: 0 }), "TypeError", EFFECTS);
  const hole = [instance("haste")];
  hole.length = 2;
  rejects(() => expireEffects({ state: { effects: hole }, time: 0 }), "TypeError", EFFECT);
  let reads = 0;
  const options = {
    state: { effects: [null] },
    get effect() {
      reads += 1;
      return validEffect();
    },
    time: 0
  };
  rejects(() => applyEffect(options), "TypeError", EFFECT);
  assert.equal(reads, 0);
});

test("a stored effect is read id, uniqueness, kind, duration, cap, policy, stacks, then the window", () => {
  rejects(() => expireEffects({ state: { effects: [{}] }, time: 0 }), "TypeError", EFFECT_ID);
  rejects(
    () => expireEffects({ state: { effects: [{ id: "" }] }, time: 0 }),
    "TypeError",
    EFFECT_ID
  );
  rejects(
    () => expireEffects({ state: { effects: [{ id: 1, kind: "buff" }] }, time: 0 }),
    "TypeError",
    EFFECT_ID
  );
  rejects(
    () =>
      expireEffects({
        state: { effects: [instance("haste"), { id: "haste", kind: "nope" }] },
        time: 0
      }),
    "TypeError",
    UNIQUE
  );
  rejects(
    () =>
      expireEffects({
        state: {
          effects: [instance("__proto__"), instance("__proto__", { appliedAt: 1, expiresAt: 11 })]
        },
        time: 0
      }),
    "TypeError",
    UNIQUE
  );
  rejects(
    () =>
      expireEffects({
        state: {
          effects: [{ id: "haste", kind: "buff", duration: 0 }, instance("haste")]
        },
        time: 0
      }),
    "RangeError",
    DURATION
  );
  const inherited = Object.create(instance("haste"));
  rejects(
    () => expireEffects({ state: { effects: [inherited] }, time: 0 }),
    "TypeError",
    EFFECT_ID
  );
  for (const kind of [undefined, null, "", "Buff", "BUFF", "buff ", 1, true]) {
    rejects(
      () => expireEffects({ state: { effects: [{ id: "haste", kind }] }, time: 0 }),
      "TypeError",
      KIND
    );
  }
  for (const duration of [
    undefined,
    null,
    true,
    "10",
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX + 1
  ]) {
    rejects(
      () =>
        expireEffects({
          state: { effects: [{ id: "haste", kind: "buff", duration }] },
          time: 0
        }),
      "RangeError",
      DURATION
    );
  }
  for (const maxStacks of [undefined, null, "1", 0, -1, 1.5, Number.NaN, MAX + 1]) {
    rejects(
      () =>
        expireEffects({
          state: {
            effects: [{ id: "haste", kind: "buff", duration: 10, maxStacks }]
          },
          time: 0
        }),
      "RangeError",
      MAX_STACKS
    );
  }
  for (const policy of [undefined, null, "", "Refresh", "add ", "extend", 1, true]) {
    rejects(
      () =>
        expireEffects({
          state: {
            effects: [{ id: "haste", kind: "buff", duration: 10, maxStacks: 1, policy }]
          },
          time: 0
        }),
      "TypeError",
      POLICY
    );
  }
  rejects(
    () =>
      expireEffects({
        state: {
          effects: [
            {
              id: "haste",
              kind: "buff",
              duration: 10,
              maxStacks: 1,
              policy: "nope",
              stacks: 0
            }
          ]
        },
        time: 0
      }),
    "TypeError",
    POLICY
  );
  for (const stacks of [undefined, null, "1", 0, -1, 1.5, Number.NaN, MAX + 1]) {
    const entry = instance("haste");
    entry.stacks = stacks;
    rejects(() => expireEffects({ state: { effects: [entry] }, time: 0 }), "RangeError", STACKS);
  }
  rejects(
    () =>
      expireEffects({
        state: { effects: [instance("haste", { stacks: 2, maxStacks: 1 })] },
        time: 0
      }),
    "RangeError",
    STACKS
  );
  rejects(
    () =>
      expireEffects({
        state: {
          effects: [instance("haste", { policy: "refresh", stacks: 2, maxStacks: 5 })]
        },
        time: 0
      }),
    "RangeError",
    STACKS_POLICY
  );
  rejects(
    () =>
      expireEffects({
        state: {
          effects: [instance("haste", { policy: "ignore", stacks: 3, maxStacks: 3 })]
        },
        time: 0
      }),
    "RangeError",
    STACKS_POLICY
  );
  for (const appliedAt of [
    undefined,
    null,
    "0",
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX + 1
  ]) {
    const entry = instance("haste");
    entry.appliedAt = appliedAt;
    rejects(
      () => expireEffects({ state: { effects: [entry] }, time: 0 }),
      "RangeError",
      APPLIED_AT
    );
  }
  for (const expiresAt of [undefined, null, "10", -1, 10.5, Number.NaN, MAX + 1]) {
    const entry = instance("haste");
    entry.expiresAt = expiresAt;
    rejects(
      () => expireEffects({ state: { effects: [entry] }, time: 0 }),
      "RangeError",
      EXPIRES_AT
    );
  }
  rejects(
    () =>
      expireEffects({
        state: { effects: [instance("haste", { expiresAt: 9 })] },
        time: 0
      }),
    "RangeError",
    WINDOW
  );
  rejects(
    () =>
      expireEffects({
        state: {
          effects: [instance("haste", { appliedAt: MAX, duration: 1, expiresAt: MAX })]
        },
        time: 0
      }),
    "RangeError",
    WINDOW
  );
  rejects(
    () =>
      expireEffects({
        state: { effects: [instance("haste", { duration: 10, appliedAt: 0, expiresAt: 11 })] },
        time: -1
      }),
    "RangeError",
    WINDOW
  );
});

test("the definition is checked before time, and time is checked before a mismatch", () => {
  let timeReads = 0;
  const missing = {
    state: { effects: [] },
    get time() {
      timeReads += 1;
      return 0;
    }
  };
  rejects(() => applyEffect(missing), "TypeError", EFFECT);
  assert.equal(timeReads, 0);
  rejects(() => applyEffect({ state: { effects: [] }, effect: [], time: -1 }), "TypeError", EFFECT);
  rejects(
    () => applyEffect({ state: { effects: [] }, effect: {}, time: -1 }),
    "TypeError",
    EFFECT_ID
  );
  rejects(
    () => applyEffect({ state: { effects: [] }, effect: { id: "" }, time: -1 }),
    "TypeError",
    EFFECT_ID
  );
  rejects(
    () => applyEffect({ state: { effects: [] }, effect: { id: "haste" }, time: -1 }),
    "TypeError",
    KIND
  );
  rejects(
    () =>
      applyEffect({
        state: { effects: [] },
        effect: { id: "haste", kind: "buff", duration: 0 },
        time: -1
      }),
    "RangeError",
    DURATION
  );
  rejects(
    () =>
      applyEffect({
        state: { effects: [] },
        effect: { id: "haste", kind: "buff", duration: 10, maxStacks: 0 },
        time: -1
      }),
    "RangeError",
    MAX_STACKS
  );
  rejects(
    () =>
      applyEffect({
        state: { effects: [] },
        effect: { id: "haste", kind: "buff", duration: 10, maxStacks: 1 },
        time: -1
      }),
    "TypeError",
    POLICY
  );
  rejects(
    () =>
      applyEffect({
        state: { effects: [] },
        effect: validEffect(),
        time: -1
      }),
    "RangeError",
    TIME
  );
  for (const time of [
    undefined,
    null,
    true,
    "0",
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX + 1
  ]) {
    rejects(
      () => applyEffect({ state: { effects: [] }, effect: validEffect(), time }),
      "RangeError",
      TIME
    );
    rejects(() => expireEffects({ state: { effects: [] }, time }), "RangeError", TIME);
  }
  rejects(
    () =>
      applyEffect({
        state: { effects: [instance("haste")] },
        effect: validEffect({ kind: "debuff", duration: 4, maxStacks: 2, policy: "add" }),
        time: -1
      }),
    "RangeError",
    TIME
  );
});

test("an active definition must match kind, duration, cap, then policy", () => {
  const active = instance("haste", { duration: 10, maxStacks: 3, policy: "add", stacks: 2 });
  rejects(
    () =>
      applyEffect({
        state: { effects: [active] },
        effect: validEffect({
          kind: "debuff",
          duration: 4,
          maxStacks: 2,
          policy: "refresh"
        }),
        time: 1
      }),
    "TypeError",
    KIND_MATCH
  );
  rejects(
    () =>
      applyEffect({
        state: { effects: [active] },
        effect: validEffect({ duration: 4, maxStacks: 2, policy: "refresh" }),
        time: 1
      }),
    "RangeError",
    DURATION_MATCH
  );
  rejects(
    () =>
      applyEffect({
        state: { effects: [active] },
        effect: validEffect({ duration: 10, maxStacks: 2, policy: "refresh" }),
        time: 1
      }),
    "RangeError",
    MAX_STACKS_MATCH
  );
  rejects(
    () =>
      applyEffect({
        state: { effects: [active] },
        effect: validEffect({ duration: 10, maxStacks: 3, policy: "refresh" }),
        time: 1
      }),
    "TypeError",
    POLICY_MATCH
  );
  const long = Object.freeze(
    instance("long", { duration: MAX, appliedAt: 0, expiresAt: MAX, policy: "refresh" })
  );
  rejects(
    () =>
      applyEffect({
        state: Object.freeze({ effects: Object.freeze([long]) }),
        effect: Object.freeze(validEffect({ id: "long", kind: "debuff", duration: MAX })),
        time: MAX - 1
      }),
    "TypeError",
    KIND_MATCH
  );
  rejects(
    () =>
      applyEffect({
        state: { effects: [long] },
        effect: validEffect({ id: "long", duration: MAX }),
        time: 1
      }),
    "RangeError",
    EXPIRES
  );
  rejects(
    () =>
      applyEffect({
        state: { effects: [] },
        effect: validEffect({ duration: MAX }),
        time: 1
      }),
    "RangeError",
    EXPIRES
  );
});

test("remove checks the id after the effects and before time", () => {
  rejects(
    () =>
      removeEffect({ state: { effects: [instance("haste", { stacks: 0 })] }, id: "", time: -1 }),
    "RangeError",
    STACKS
  );
  rejects(() => removeEffect({ state: { effects: [] }, time: -1 }), "TypeError", ID);
  rejects(() => removeEffect({ state: { effects: [] }, id: "", time: -1 }), "TypeError", ID);
  rejects(() => removeEffect({ state: { effects: [] }, id: 1, time: 0 }), "TypeError", ID);
  rejects(
    () => removeEffect({ state: { effects: [] }, id: "haste", time: -1 }),
    "RangeError",
    TIME
  );
  let timeReads = 0;
  const options = {
    state: { effects: [] },
    id: "",
    get time() {
      timeReads += 1;
      return 0;
    }
  };
  rejects(() => removeEffect(options), "TypeError", ID);
  assert.equal(timeReads, 0);
});

test("string objects are rejected and a space id is accepted", () => {
  rejects(
    () =>
      applyEffect({
        state: { effects: [] },
        effect: {
          id: new String("haste"),
          kind: "buff",
          duration: 1,
          maxStacks: 1,
          policy: "refresh"
        },
        time: 0
      }),
    "TypeError",
    EFFECT_ID
  );
  const result = expireEffects({
    state: { effects: [instance(" ")] },
    time: 0
  });
  assert.equal(result.effects[0].id, " ");
  const kept = expireEffects({
    state: {
      effects: [
        instance("haste", { policy: "add", stacks: MAX, maxStacks: MAX, duration: 1, expiresAt: 1 })
      ]
    },
    time: 0
  });
  assert.equal(kept.effects[0].stacks, MAX);
});
