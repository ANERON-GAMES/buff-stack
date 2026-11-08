export const EffectKind = Object.freeze({
  Buff: "buff",
  Debuff: "debuff"
});

export const StackPolicy = Object.freeze({
  Refresh: "refresh",
  Add: "add",
  Ignore: "ignore"
});

export const ApplyOutcome = Object.freeze({
  Applied: "applied",
  Refreshed: "refreshed",
  Stacked: "stacked",
  Maxed: "maxed",
  Ignored: "ignored"
});
