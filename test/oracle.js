function copyStored(effect) {
  return {
    id: effect.id,
    kind: effect.kind,
    policy: effect.policy,
    stacks: effect.stacks,
    maxStacks: effect.maxStacks,
    duration: effect.duration,
    appliedAt: effect.appliedAt,
    expiresAt: effect.expiresAt
  };
}

function present(effect, time) {
  return {
    ...copyStored(effect),
    remaining: effect.expiresAt - time
  };
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

function sortEffects(effects) {
  const ordered = effects.slice();
  ordered.sort((left, right) => compareString(left.id, right.id));
  return ordered;
}

export function runOracle(steps) {
  let stored = [];
  const results = [];
  for (const step of steps) {
    const expired = [];
    const active = [];
    for (const effect of stored) {
      if (effect.expiresAt <= step.time) {
        expired.push(effect.id);
      } else {
        active.push(copyStored(effect));
      }
    }
    expired.sort(compareString);
    let outcome = null;
    let removed = null;
    if (step.op === "apply") {
      let index = -1;
      for (let position = 0; position < active.length; position += 1) {
        if (active[position].id === step.effect.id) {
          index = position;
          break;
        }
      }
      if (index === -1) {
        active.push({
          id: step.effect.id,
          kind: step.effect.kind,
          policy: step.effect.policy,
          stacks: 1,
          maxStacks: step.effect.maxStacks,
          duration: step.effect.duration,
          appliedAt: step.time,
          expiresAt: step.time + step.effect.duration
        });
        outcome = "applied";
      } else if (step.effect.policy === "ignore") {
        outcome = "ignored";
      } else if (step.effect.policy === "refresh") {
        const current = active[index];
        active[index] = {
          ...current,
          appliedAt: step.time,
          expiresAt: step.time + current.duration
        };
        outcome = "refreshed";
      } else if (active[index].stacks < active[index].maxStacks) {
        const current = active[index];
        active[index] = {
          ...current,
          stacks: current.stacks + 1,
          appliedAt: step.time,
          expiresAt: step.time + current.duration
        };
        outcome = "stacked";
      } else {
        const current = active[index];
        active[index] = {
          ...current,
          appliedAt: step.time,
          expiresAt: step.time + current.duration
        };
        outcome = "maxed";
      }
    } else if (step.op === "remove") {
      const next = [];
      removed = false;
      for (const effect of active) {
        if (effect.id === step.id) {
          removed = true;
        } else {
          next.push(effect);
        }
      }
      active.length = 0;
      for (const effect of next) {
        active.push(effect);
      }
    }
    const effects = [];
    for (const effect of sortEffects(active)) {
      effects.push(present(effect, step.time));
    }
    stored = [];
    for (const effect of effects) {
      stored.push(copyStored(effect));
    }
    const result = {
      time: step.time,
      expired,
      effects
    };
    if (outcome !== null) {
      result.outcome = outcome;
    }
    if (removed !== null) {
      result.removed = removed;
    }
    results.push(result);
  }
  return results;
}
