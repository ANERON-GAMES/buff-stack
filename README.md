# @aneron/buff-stack

Timed buffs and debuffs on one entity, with stack caps, reapplication policies, and expiry.

## Purpose

`@aneron/buff-stack` tracks timed status effects on one entity. Each effect is a buff or a debuff. It has a duration, a maximum stack count, and one reapplication policy: `refresh`, `add`, or `ignore`. Refresh restarts the timer and leaves the stack count alone. Add gains one stack, up to the maximum, and restarts the timer. At the maximum, a further add keeps the stack count and still restarts the timer. Ignore leaves an active effect unchanged, including its expiry.

The caller passes the time on every call. An effect is active while `time < expiresAt`. At `expiresAt` it is expired. Every call returns only the effects that are still active, so expired effects are removed in the result instead of being left for the caller to filter. The same state and the same numbers produce the same result. Time is an argument. The module never reads a clock, starts a timer, draws a random number, or opens a socket. It has no runtime dependencies and no mutable module state.

The caller chooses the time unit. Milliseconds and simulation ticks are both valid, provided every value is a safe integer in that unit. The module does not convert units.

Buff and debuff are labels. The module does not cancel a buff because a debuff is present, and it does not turn stacks into a stat bonus. The caller reads `id`, `kind`, and `stacks` and applies the game rules. One state object is one entity. The caller keeps a separate state for each entity.

## Install

The package is an ES module. It needs Node.js 20 or newer. It has no runtime dependencies. The package name is `@aneron/buff-stack`. It is not published to the npm registry.

Clone this repository and run the tests:

```bash
git clone https://github.com/ANERON-GAMES/buff-stack.git
cd buff-stack
npm install
npm test
```

`npm test` runs `node --test`. `npm run lint` runs ESLint. `npm run format:check` runs Prettier.

Install it as a dependency from the git repository:

```bash
npm install github:ANERON-GAMES/buff-stack
```

```js
import { applyEffect, createState, expireEffects, removeEffect } from "@aneron/buff-stack";
```

Code in this repository imports the same entry point with `./src/index.js`.

## Usage

Times below are in the caller's unit. Haste is a buff with duration `10`, a cap of `3`, and the `add` policy.

```js
import { applyEffect, createState, expireEffects, removeEffect } from "@aneron/buff-stack";

const haste = {
  id: "haste",
  kind: "buff",
  duration: 10,
  maxStacks: 3,
  policy: "add"
};

const first = applyEffect({ state: createState(), effect: haste, time: 0 });
const second = applyEffect({ state: first, effect: haste, time: 4 });
const third = applyEffect({ state: second, effect: haste, time: 6 });
const fourth = applyEffect({ state: third, effect: haste, time: 8 });
const still = expireEffects({ state: fourth, time: 17 });
const faded = expireEffects({ state: fourth, time: 18 });
const restarted = applyEffect({ state: fourth, effect: haste, time: 18 });
```

`first.outcome` is `"applied"`. `first.time` is `0`. `first.expired` is `[]`. `first.effects[0].id` is `"haste"`. `first.effects[0].kind` is `"buff"`. `first.effects[0].policy` is `"add"`. `first.effects[0].stacks` is `1`. `first.effects[0].maxStacks` is `3`. `first.effects[0].duration` is `10`. `first.effects[0].appliedAt` is `0`. `first.effects[0].expiresAt` is `10`. `first.effects[0].remaining` is `10`.

`second.outcome` is `"stacked"`. The stack count goes from `1` to `2`, and the window restarts at `4`. `second.effects[0].stacks` is `2`. `second.effects[0].appliedAt` is `4`. `second.effects[0].expiresAt` is `14`. `second.effects[0].remaining` is `10`.

`third.outcome` is `"stacked"`. That application reaches the cap by adding the last stack. `third.effects[0].stacks` is `3`. `third.effects[0].appliedAt` is `6`. `third.effects[0].expiresAt` is `16`.

`fourth.outcome` is `"maxed"`. The stack count stays at the cap and the window still restarts. `fourth.effects[0].stacks` is `3`. `fourth.effects[0].appliedAt` is `8`. `fourth.effects[0].expiresAt` is `18`. `fourth.effects[0].remaining` is `10`.

`still.expired` is `[]`. `still.effects[0].remaining` is `1`. `still.effects[0].expiresAt` is `18`. One unit remains at time `17`.

`faded.expired` is `["haste"]`. `faded.effects.length` is `0`. At time `18` the effect is expired, so the result does not contain it.

`restarted.outcome` is `"applied"`. A call at the expiry instant does not refresh the old effect. The old effect is already gone, and the new one starts at one stack. `restarted.expired` is `["haste"]`. `restarted.effects[0].stacks` is `1`. `restarted.effects[0].appliedAt` is `18`. `restarted.effects[0].expiresAt` is `28`.

Shield uses `refresh`. Reapplying it restarts the timer and does not add a stack.

```js
const shield = {
  id: "shield",
  kind: "buff",
  duration: 5,
  maxStacks: 1,
  policy: "refresh"
};

const opened = applyEffect({ state: createState(), effect: shield, time: 0 });
const renewed = applyEffect({ state: opened, effect: shield, time: 4 });
```

`opened.effects[0].expiresAt` is `5`. `renewed.outcome` is `"refreshed"`. `renewed.effects[0].stacks` is `1`. `renewed.effects[0].appliedAt` is `4`. `renewed.effects[0].expiresAt` is `9`. `renewed.effects[0].remaining` is `5`.

Poison uses `ignore`. A second application while it is active changes nothing about the stored window.

```js
const poison = {
  id: "poison",
  kind: "debuff",
  duration: 8,
  maxStacks: 1,
  policy: "ignore"
};

const inflicted = applyEffect({ state: createState(), effect: poison, time: 2 });
const resisted = applyEffect({ state: inflicted, effect: poison, time: 5 });
```

`inflicted.effects[0].expiresAt` is `10`. `resisted.outcome` is `"ignored"`. `resisted.effects[0].stacks` is `1`. `resisted.effects[0].appliedAt` is `2`. `resisted.effects[0].expiresAt` is `10`. `resisted.effects[0].remaining` is `5`. The remaining time changed because the query time changed. The stored expiry did not.

Shield and poison share one entity. The result lists effects by id, so poison comes before shield. Refreshing shield does not move poison.

```js
const withShield = applyEffect({ state: createState(), effect: shield, time: 0 });
const withPoison = applyEffect({ state: withShield, effect: poison, time: 1 });
const refreshed = applyEffect({ state: withPoison, effect: shield, time: 3 });
const swept = expireEffects({ state: refreshed, time: 8 });
const gone = expireEffects({ state: swept, time: 9 });
```

`refreshed.outcome` is `"refreshed"`. `refreshed.effects[0].id` is `"poison"`. `refreshed.effects[0].expiresAt` is `9`. `refreshed.effects[0].remaining` is `6`. `refreshed.effects[1].id` is `"shield"`. `refreshed.effects[1].appliedAt` is `3`. `refreshed.effects[1].expiresAt` is `8`. `refreshed.effects[1].remaining` is `5`.

`swept.expired` is `["shield"]`. `swept.effects.length` is `1`. `swept.effects[0].id` is `"poison"`. `swept.effects[0].remaining` is `1`. Shield ends at `8`. Poison ends at `9`.

`gone.expired` is `["poison"]`. `gone.effects.length` is `0`.

A reapplication at the exact expiry starts over. `withShield` ends at `5`.

```js
const again = applyEffect({ state: withShield, effect: shield, time: 5 });
```

`again.outcome` is `"applied"`. `again.expired` is `["shield"]`. `again.effects[0].stacks` is `1`. `again.effects[0].appliedAt` is `5`. `again.effects[0].expiresAt` is `10`. `again.effects[0].remaining` is `5`.

`removeEffect` drops one active id. Other effects stay. Expired effects are still removed by the time check.

```js
const dispelled = removeEffect({ state: withPoison, id: "poison", time: 2 });
```

`dispelled.removed` is `true`. `dispelled.expired.length` is `0`. `dispelled.effects.length` is `1`. `dispelled.effects[0].id` is `"shield"`. `dispelled.effects[0].remaining` is `3`.

The calls above do not write into the objects they were given.

```js
const snapshot = createState();
applyEffect({ state: snapshot, effect: shield, time: 0 });
```

`snapshot.effects.length` is still `0`. `shield.maxStacks` is still `1`. `Object.hasOwn(shield, "stacks")` is still `false`.

`remaining` is computed for the time of that call. It is not stored as an input. `still` was queried at `17`, so its remaining value is `1`. Querying that same state at an earlier time, while the effect is still in the state, reports a larger remaining time and does not drop the effect.

```js
const rewound = expireEffects({ state: still, time: 8 });
const early = expireEffects({ state: fourth, time: 0 });
const lost = expireEffects({ state: faded, time: 8 });
```

`rewound.expired.length` is `0`. `rewound.effects[0].remaining` is `10`. `rewound.effects[0].expiresAt` is `18`. `early.expired` is `[]`. `early.effects[0].appliedAt` is `8`. `early.effects[0].remaining` is `18`. The query time is before `appliedAt`, and the effect has not expired, so it stays. `lost.effects.length` is `0`. `faded` already dropped haste. A later call cannot restore an effect that an earlier result removed. Keep the earlier state if you need to look at an earlier instant.

## API

`createState`, `applyEffect`, `expireEffects`, and `removeEffect` are functions. `EffectKind`, `StackPolicy`, and `ApplyOutcome` are frozen objects. There is no constructor and no shared state. Each call reads its argument and returns a new result. The same input produces a deep-equal result and a new object tree.

A call freezes only the objects it creates. Inputs stay mutable for the caller.

Own fields are read. Unknown fields are ignored. An omitted field does not receive a default: every documented field is required, except that `createState` takes no argument. A field whose value is `undefined` fails the check for that field. A frozen object and an object with a null prototype are accepted. Inherited fields are ignored. A getter on an unknown field is left unread.

Integer means `Number.isSafeInteger`. `1.0` is accepted. `1.5`, `Infinity`, `NaN`, and `Number.MAX_SAFE_INTEGER + 1` are rejected. `-0` is stored as `0`.

Ids are primitive strings. They are not trimmed and are not case-folded. `"haste"` and `"Haste"` are different ids and can both be active. A string of one space is a valid id. `"__proto__"` and `"constructor"` are valid ids. `"Haste"` sorts before `"haste"` because the code unit `H` is before `h`.

The returned value of `applyEffect`, `expireEffects`, or `removeEffect` can be passed as the next `state`. Only `state.effects` is read. `time`, `outcome`, `expired`, `removed`, and `remaining` on the way in are ignored.

### Constants

`EffectKind` is frozen.

| Field    | Value      |
| -------- | ---------- |
| `Buff`   | `"buff"`   |
| `Debuff` | `"debuff"` |

`StackPolicy` is frozen.

| Field     | Value       | Reapplication while the effect is active                             |
| --------- | ----------- | -------------------------------------------------------------------- |
| `Refresh` | `"refresh"` | Restart the window. Leave `stacks` unchanged.                        |
| `Add`     | `"add"`     | Add one stack when below `maxStacks`. Restart the window either way. |
| `Ignore`  | `"ignore"`  | Leave the stored effect unchanged.                                   |

`ApplyOutcome` is frozen. `applyEffect` returns one of these strings.

| Field       | Value         | When                                                                                         |
| ----------- | ------------- | -------------------------------------------------------------------------------------------- |
| `Applied`   | `"applied"`   | No active effect has this id. Stacks start at `1`.                                           |
| `Refreshed` | `"refreshed"` | The active policy is `refresh`. Stacks stay, and the window restarts.                        |
| `Stacked`   | `"stacked"`   | The active policy is `add`, and `stacks` increased by `1`.                                   |
| `Maxed`     | `"maxed"`     | The active policy is `add`, and `stacks` was already `maxStacks`. The window still restarts. |
| `Ignored`   | `"ignored"`   | The active policy is `ignore`. The stored window and stacks stay.                            |

Reaching the cap by adding the last stack is `stacked`. The next application is `maxed`. An effect that has already expired is not refreshed, stacked, maxed, or ignored. The call that lands at `expiresAt` is `applied`.

### `createState()`

```js
createState();
```

Return a frozen object `{ effects }` whose `effects` array is empty and frozen. Each call returns new objects. Arguments are ignored.

### `applyEffect(options)`

```js
applyEffect(options);
```

Apply one definition at `time`, after dropping effects that are not active at that time.

`options` must be an object and must not be an array. Otherwise the function throws `TypeError` with the message `options must be an object`.

Checks run in this order. The first failure wins. A throw returns no result.

1. `options` is an object.
2. `state` is an object.
3. `state.effects` is an array. Each entry is read in order, and each entry is fully checked before the next entry.
4. `effect` is an object, then its `id`, `kind`, `duration`, `maxStacks`, and `policy`.
5. `time` is an integer greater than or equal to `0`.
6. If an effect with that `id` is active at `time`, its `kind`, `duration`, `maxStacks`, and `policy` match the definition, in that order.
7. If the outcome writes a new expiry, `time + duration` is a safe integer.

| Field    | Accepted values                                                     |
| -------- | ------------------------------------------------------------------- |
| `state`  | An object with an own `effects` array. An empty array is valid.     |
| `effect` | The definition to apply. Unknown fields on it are ignored.          |
| `time`   | A safe integer greater than or equal to `0`. `-0` is stored as `0`. |

### `effect` definition

`effect` must be an own property whose value is an object and not an array. Otherwise `TypeError`: `effect must be an object`.

The definition is read in order:

1. `id` must be an own property whose value is a string of length at least `1`. Otherwise `TypeError`: `effect id must be a non-empty string`.
2. `kind` must be `"buff"` or `"debuff"`. Otherwise `TypeError`: `effect kind must be buff or debuff`.
3. `duration` must be an own safe integer greater than or equal to `1`. Otherwise `RangeError`: `duration must be an integer greater than or equal to 1`.
4. `maxStacks` must be an own safe integer greater than or equal to `1`. Otherwise `RangeError`: `maxStacks must be an integer greater than or equal to 1`.
5. `policy` must be `"refresh"`, `"add"`, or `"ignore"`. Otherwise `TypeError`: `policy must be refresh, add, or ignore`.

`stacks`, `appliedAt`, `expiresAt`, and `remaining` on the definition are ignored. A new effect always starts at `1` stack. `policy` other than `add` never raises the stack count, so a stored effect with that policy has `stacks` of `1`. `maxStacks` is still required, and it is the cap when the policy is `add`.

### `expireEffects(options)`

```js
expireEffects(options);
```

Return the effects that are active at `time`, and the ids that were removed because they were expired.

Checks run in this order:

1. `options` is an object.
2. `state` is an object.
3. `state.effects` is an array. Each entry is read in order.
4. `time` is an integer greater than or equal to `0`.

There is no definition and no removal id. A state that is already empty returns empty `effects` and empty `expired`.

### `removeEffect(options)`

```js
removeEffect(options);
```

Drop one active effect by id, and also drop every effect that is expired at `time`.

Checks run in this order:

1. `options` is an object.
2. `state` is an object.
3. `state.effects` is an array. Each entry is read in order.
4. `id` is a string of length at least `1`. Otherwise `TypeError`: `id must be a non-empty string`.
5. `time` is an integer greater than or equal to `0`.

`removed` is `true` only when an effect with that id was active at `time` and was dropped because of this call. An id that is already expired is listed in `expired` and `removed` is `false`. An unknown id leaves `removed` as `false`. The other active effects stay.

### `state.effects`

`effects` must be an own property of `state` whose value is an array. Otherwise `TypeError`: `effects must be an array`. A missing `state`, an array `state`, and a state that is not an object throw `TypeError`: `state must be an object`.

A hole in the array is `undefined` and fails the object check.

Each entry must be an object and must not be an array. Otherwise `TypeError`: `effect must be an object`.

Each stored effect is read in order:

1. `id` must be an own non-empty string. Otherwise `TypeError`: `effect id must be a non-empty string`.
2. That id must not already have been seen in this array. Otherwise `TypeError`: `effect ids must be unique`.
3. `kind` must be `"buff"` or `"debuff"`. Otherwise `TypeError`: `effect kind must be buff or debuff`.
4. `duration` must be an own safe integer greater than or equal to `1`. Otherwise `RangeError`: `duration must be an integer greater than or equal to 1`.
5. `maxStacks` must be an own safe integer greater than or equal to `1`. Otherwise `RangeError`: `maxStacks must be an integer greater than or equal to 1`.
6. `policy` must be `"refresh"`, `"add"`, or `"ignore"`. Otherwise `TypeError`: `policy must be refresh, add, or ignore`.
7. `stacks` must be an own safe integer from `1` through `maxStacks`. Otherwise `RangeError`: `stacks must be an integer greater than or equal to 1 and less than or equal to maxStacks`.
8. When `policy` is not `add`, `stacks` must be `1`. Otherwise `RangeError`: `stacks must be 1 when policy is not add`.
9. `appliedAt` must be an own safe integer greater than or equal to `0`. Otherwise `RangeError`: `appliedAt must be an integer greater than or equal to 0`.
10. `expiresAt` must be an own safe integer greater than or equal to `0`. Otherwise `RangeError`: `expiresAt must be an integer greater than or equal to 0`.
11. `expiresAt` must equal `appliedAt + duration`, and that sum must be a safe integer. Otherwise `RangeError`: `expiresAt must equal appliedAt plus duration`.

The duplicate check happens before `kind` is read. A repeated id with a bad kind reports the duplicate. The first effect is finished before the second effect is read, so a bad duration on the first effect is reported before a duplicate id on the second effect.

Unknown effect fields are ignored. They are not copied onto the result.

An effect is expired when `expiresAt <= time`. Otherwise it is active. `appliedAt` does not remove an effect. A query with `time < appliedAt` keeps the effect when `expiresAt` is still ahead of `time`.

### Active definition match

When `applyEffect` finds an active effect with the same id, the definition must match that effect. Checks run in this order:

1. `kind` must be equal. Otherwise `TypeError`: `effect kind must match the active effect`.
2. `duration` must be equal. Otherwise `RangeError`: `effect duration must match the active effect`.
3. `maxStacks` must be equal. Otherwise `RangeError`: `effect maxStacks must match the active effect`.
4. `policy` must be equal. Otherwise `TypeError`: `effect policy must match the active effect`.

An expired effect with the same id does not take part in this match. The definition can change after expiry. The new effect starts at one stack.

The match is reported before the safe-sum check. A definition that does not match does not also report an overflow. `ignore` does not compute a new expiry, so a time at which `time + duration` would leave the safe integer range still returns `ignored` when the effect is active.

When the outcome is `applied`, `refreshed`, `stacked`, or `maxed`, the next expiry is `time + duration`. If that sum is greater than `Number.MAX_SAFE_INTEGER`, the function throws `RangeError`: `expiresAt must be a safe integer`. No result is returned.

### Result

`applyEffect` returns a frozen object:

| Field     | Meaning                                                                                      |
| --------- | -------------------------------------------------------------------------------------------- |
| `time`    | The instant used for this call.                                                              |
| `outcome` | An `ApplyOutcome` string.                                                                    |
| `expired` | Ids that were in the input and were not active at `time`, sorted by id. The array is frozen. |
| `effects` | The active effects after the application, sorted by id. The array is frozen.                 |

An id can appear in both `expired` and `effects` when the old effect was expired and this call applied a new one.

`expireEffects` returns a frozen object:

| Field     | Meaning                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `time`    | The instant used for this call.                                             |
| `expired` | Ids removed because `expiresAt <= time`, sorted by id. The array is frozen. |
| `effects` | The effects that remain, sorted by id. The array is frozen.                 |

`removeEffect` returns a frozen object:

| Field     | Meaning                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `time`    | The instant used for this call.                                             |
| `removed` | `true` when the named id was active and was removed by this call.           |
| `expired` | Ids removed because `expiresAt <= time`, sorted by id. The array is frozen. |
| `effects` | The effects that remain, sorted by id. The array is frozen.                 |

The named id is not placed in `expired` when it was active and `removed` is `true`.

Each effect entry is a frozen object:

| Field       | Meaning                                                          |
| ----------- | ---------------------------------------------------------------- |
| `id`        | The effect id.                                                   |
| `kind`      | `"buff"` or `"debuff"`.                                          |
| `policy`    | `"refresh"`, `"add"`, or `"ignore"`.                             |
| `stacks`    | The stack count after this call.                                 |
| `maxStacks` | The cap stored for this effect.                                  |
| `duration`  | The duration stored for this effect.                             |
| `appliedAt` | The time that opened the current window.                         |
| `expiresAt` | `appliedAt + duration`.                                          |
| `remaining` | `expiresAt - time`. It is at least `1` on every returned effect. |

`effects` is ordered by id ascending, using UTF-16 code unit order, the same order as `<` on strings. `expired` uses that same order. The input order is not used. Reversing the input does not change the result.

`remaining` can be greater than `duration` when `time < appliedAt`. It is never negative, because an effect with `expiresAt <= time` is omitted. `remaining` of `1` means the effect expires on the next integer.

For `refresh` and `ignore`, `stacks` is `1`. For `add`, `stacks` is from `1` through `maxStacks`. `expiresAt - appliedAt` equals `duration` for every effect the module returns and for every effect it accepts.

The result does not share object or array references with the input or with another call. A no-op `ignore`, a no-op removal, and an expiry that removes nothing still return new objects.

### Schedule

Let the input effects be partitioned by the passed-in time. An effect with `expiresAt <= time` is expired. Every other effect is active. The partition uses the passed-in number only. It does not read a clock.

`applyEffect` then looks for an active effect with the definition's id.

1. If there is none, the outcome is `applied`. The new effect has `stacks` of `1`, `appliedAt` of `time`, and `expiresAt` of `time + duration`.
2. If the policy is `ignore`, the outcome is `ignored`. `stacks`, `appliedAt`, and `expiresAt` stay as they were.
3. If the policy is `refresh`, the outcome is `refreshed`. `stacks` stays. `appliedAt` becomes `time`. `expiresAt` becomes `time + duration`.
4. If the policy is `add` and `stacks < maxStacks`, the outcome is `stacked`. `stacks` increases by `1`. `appliedAt` becomes `time`. `expiresAt` becomes `time + duration`.
5. If the policy is `add` and `stacks === maxStacks`, the outcome is `maxed`. `stacks` stays. `appliedAt` becomes `time`. `expiresAt` becomes `time + duration`.

Other active effects are copied forward. Their stored fields do not change. Their `remaining` is computed from the new time.

`expireEffects` is that partition and nothing else. `removeEffect` is that partition, then a drop of the active effect whose id is the requested id, when one exists.

`time + duration` is rejected when `duration > Number.MAX_SAFE_INTEGER - time`. The comparison uses safe integers, so the sum is exact when it is accepted. A boundary that would pass `Number.MAX_SAFE_INTEGER` throws, and no result is returned.

### Errors

| When the check fails                                                  | Error        | Message                                                                                    |
| --------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| `options` is missing, an array, or not an object                      | `TypeError`  | `options must be an object`                                                                |
| `state` is missing or not an object                                   | `TypeError`  | `state must be an object`                                                                  |
| `effects` is missing or not an array                                  | `TypeError`  | `effects must be an array`                                                                 |
| An effect entry, or the definition, is an array or not an object      | `TypeError`  | `effect must be an object`                                                                 |
| An effect id is not a non-empty string                                | `TypeError`  | `effect id must be a non-empty string`                                                     |
| An effect id is repeated                                              | `TypeError`  | `effect ids must be unique`                                                                |
| `kind` is missing or not `buff` or `debuff`                           | `TypeError`  | `effect kind must be buff or debuff`                                                       |
| `duration` is missing or not an integer greater than or equal to `1`  | `RangeError` | `duration must be an integer greater than or equal to 1`                                   |
| `maxStacks` is missing or not an integer greater than or equal to `1` | `RangeError` | `maxStacks must be an integer greater than or equal to 1`                                  |
| `policy` is missing or not `refresh`, `add`, or `ignore`              | `TypeError`  | `policy must be refresh, add, or ignore`                                                   |
| `stacks` is missing or outside `1 .. maxStacks`                       | `RangeError` | `stacks must be an integer greater than or equal to 1 and less than or equal to maxStacks` |
| `policy` is not `add` and `stacks` is not `1`                         | `RangeError` | `stacks must be 1 when policy is not add`                                                  |
| `appliedAt` is missing or not an integer greater than or equal to `0` | `RangeError` | `appliedAt must be an integer greater than or equal to 0`                                  |
| `expiresAt` is missing or not an integer greater than or equal to `0` | `RangeError` | `expiresAt must be an integer greater than or equal to 0`                                  |
| `expiresAt` is not `appliedAt + duration`                             | `RangeError` | `expiresAt must equal appliedAt plus duration`                                             |
| `id` is missing or not a non-empty string                             | `TypeError`  | `id must be a non-empty string`                                                            |
| `time` is missing or not an integer greater than or equal to `0`      | `RangeError` | `time must be an integer greater than or equal to 0`                                       |
| An active effect's `kind` differs from the definition                 | `TypeError`  | `effect kind must match the active effect`                                                 |
| An active effect's `duration` differs from the definition             | `RangeError` | `effect duration must match the active effect`                                             |
| An active effect's `maxStacks` differs from the definition            | `RangeError` | `effect maxStacks must match the active effect`                                            |
| An active effect's `policy` differs from the definition               | `TypeError`  | `effect policy must match the active effect`                                               |
| `time + duration` exceeds the safe integer range                      | `RangeError` | `expiresAt must be a safe integer`                                                         |

`id` applies to `removeEffect`. The definition-match errors and the safe-sum error apply to `applyEffect`. The message `effect must be an object` applies to a bad entry in `state.effects` and to a bad `effect` definition. The entry is checked first.

## Design notes

Individual timers that only refresh, or only stack, or only refuse a second application, each show up in real status effects. Haste that builds to three stacks and then holds the cap is `add`. A shield that should never stack, but should not fall off while the caster keeps spending it, is `refresh`. A poison that must run its course, where a second hit must not extend it, is `ignore`. One policy per effect keeps those rules on the effect itself. The caller does not keep a side table of what to do the next time that id appears.

The three policies stay distinct at the cap. `add` at `maxStacks` still restarts the window, and the outcome is `maxed`, so the application landed. `ignore` does not restart it. `refresh` restarts it and never increases stacks. If a full stack of `add` did nothing, it would be `ignore`, and the caller could not ask for a cap that still extends the duration. Reaching the cap by adding the last stack is `stacked`, because the count changed. The following application is the one that reports `maxed`.

Expiry is the instant the effect is no longer active. The test is `expiresAt <= time`, so the effect occupies the half-open interval from `appliedAt` up to but not including `expiresAt`. A call at the exact expiry removes it. Reapplying at that same instant starts a new effect at one stack. Treating the expiry instant as still active would let a zero-length tail keep a buff that the duration said was over. `remaining` is then at least `1` on every effect the caller receives. An effect that is due now is in `expired`, not in `effects` with a remaining time of `0`.

The module removes expired effects inside the returned state so the next call does not have to know which rows are stale. `expireEffects` is the sweep when nothing is being applied or removed. `applyEffect` and `removeEffect` sweep as well. A buff that ended at the same instant another buff was refreshed is not left in the list beside it.

There is no history inside a result. Once a call returns a state without an effect, a later call that passes that state cannot bring the effect back, including a later call with an earlier time. Rewinding is done by keeping the earlier state and passing it with the earlier time. An effect that is still in the state, and whose `expiresAt` is still ahead of the query, stays. `remaining` is derived from that query, so a stale `remaining` field on the input does not survive. A query before `appliedAt` can report a `remaining` greater than `duration`. That is the distance to the stored expiry, not a second application.

Buff and debuff do not interact. Poison does not remove haste, and haste does not remove poison. They share a list because they share an entity. What the id means, and how stacks change damage or speed, stays with the caller. The module would have to invent those rules, and two games would not want the same ones.

The output order is fixed so two callers with the same effects make the same lists. Reversing the input does not change the order. Ids break ties by UTF-16 code units, which is the order already used by string comparison. `"Haste"` comes before `"haste"`. The caller does not pre-sort. `expired` uses the same order, so a pair of effects that end together is listed the same way every time.

Safe integers keep the window exact. `expiresAt` is `appliedAt + duration`, and a returned effect always satisfies that equality. A float timeline would make the expiry comparison depend on rounding. A sum that would leave the safe integer range throws, so a caller never receives a rounded expiry. `ignore` does not form a new sum, because it does not move the window.

The result is a pure reduction of the state and the time the caller passed. Inputs stay mutable. Two calls do not share result objects, so freezing one result cannot change the next call. A later edit of a duration is visible only to a later call, and only if that duration is part of the input that call reads. The earlier frozen result keeps the windows it already returned.

One state is one entity. The module does not take an entity id, and it does not store a world of entities. The caller decides which state belongs to which entity and passes that object back in. Empty `effects` is a valid entity with nothing on it. `createState` is that empty object, frozen. A caller that already has an array can pass `{ effects }` directly.

## License

MIT. Copyright (c) 2026 Vadim Gubin.
