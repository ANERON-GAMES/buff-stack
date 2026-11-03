import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { applyEffect, createState, expireEffects, removeEffect } from "../src/index.js";
import * as api from "../src/index.js";

const root = new URL("..", import.meta.url);

test("public exports stay limited to the documented surface", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "ApplyOutcome",
    "EffectKind",
    "StackPolicy",
    "applyEffect",
    "createState",
    "expireEffects",
    "removeEffect"
  ]);
  assert.equal(typeof api.createState, "function");
  assert.equal(typeof api.applyEffect, "function");
  assert.equal(typeof api.expireEffects, "function");
  assert.equal(typeof api.removeEffect, "function");
  assert.equal(createState, api.createState);
  assert.equal(applyEffect, api.applyEffect);
  assert.equal(expireEffects, api.expireEffects);
  assert.equal(removeEffect, api.removeEffect);
  assert.equal(Object.isFrozen(api.EffectKind), true);
  assert.equal(Object.isFrozen(api.StackPolicy), true);
  assert.equal(Object.isFrozen(api.ApplyOutcome), true);
});

test("package metadata names the module and the author", () => {
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(pkg.name, "@aneron/buff-stack");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.author, "Vadim Gubin");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.sideEffects, false);
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.main, "./src/index.js");
  assert.equal(pkg.exports, "./src/index.js");
  assert.equal(pkg.repository.type, "git");
  assert.equal(pkg.repository.url, "git+https://github.com/ANERON-GAMES/buff-stack.git");
  assert.deepEqual(pkg.files, ["src", "LICENSE", "README.md"]);
  assert.equal(pkg.scripts.test, "node --test test/*.test.js");
  assert.equal(pkg.scripts.lint, "eslint .");
  assert.equal(pkg.scripts.format, "prettier --write .");
  assert.equal(pkg.scripts["format:check"], "prettier --check .");
  const license = readFileSync(new URL("LICENSE", root), "utf8");
  assert.equal(license.includes("Copyright (c) 2026 Vadim Gubin"), true);
  assert.equal(license.includes("anerongames"), false);
  const readme = readFileSync(new URL("README.md", root), "utf8");
  for (const heading of [
    "## Purpose",
    "## Install",
    "## Usage",
    "## API",
    "## Design notes",
    "## License"
  ]) {
    assert.equal(readme.includes(heading), true, heading);
  }
  for (const phrase of [
    '`first.outcome` is `"applied"`',
    "`first.effects[0].stacks` is `1`",
    "`first.effects[0].expiresAt` is `10`",
    "`first.effects[0].remaining` is `10`",
    '`second.outcome` is `"stacked"`',
    "`second.effects[0].stacks` is `2`",
    "`second.effects[0].expiresAt` is `14`",
    '`third.outcome` is `"stacked"`',
    "`third.effects[0].stacks` is `3`",
    '`fourth.outcome` is `"maxed"`',
    "`fourth.effects[0].stacks` is `3`",
    "`fourth.effects[0].expiresAt` is `18`",
    "`fourth.effects[0].remaining` is `10`",
    "`still.effects[0].remaining` is `1`",
    '`faded.expired` is `["haste"]`',
    "`faded.effects.length` is `0`",
    '`restarted.outcome` is `"applied"`',
    '`restarted.expired` is `["haste"]`',
    "`restarted.effects[0].stacks` is `1`",
    "`restarted.effects[0].appliedAt` is `18`",
    "`restarted.effects[0].expiresAt` is `28`",
    '`renewed.outcome` is `"refreshed"`',
    "`renewed.effects[0].stacks` is `1`",
    "`renewed.effects[0].expiresAt` is `9`",
    "`renewed.effects[0].remaining` is `5`",
    '`resisted.outcome` is `"ignored"`',
    "`resisted.effects[0].appliedAt` is `2`",
    "`resisted.effects[0].expiresAt` is `10`",
    "`resisted.effects[0].remaining` is `5`",
    '`refreshed.effects[0].id` is `"poison"`',
    "`refreshed.effects[0].remaining` is `6`",
    '`refreshed.effects[1].id` is `"shield"`',
    "`refreshed.effects[1].expiresAt` is `8`",
    '`swept.expired` is `["shield"]`',
    '`swept.effects[0].id` is `"poison"`',
    "`swept.effects[0].remaining` is `1`",
    '`gone.expired` is `["poison"]`',
    "`gone.effects.length` is `0`",
    '`again.outcome` is `"applied"`',
    '`again.expired` is `["shield"]`',
    "`again.effects[0].appliedAt` is `5`",
    "`again.effects[0].expiresAt` is `10`",
    "`dispelled.removed` is `true`",
    '`dispelled.effects[0].id` is `"shield"`',
    "`dispelled.effects[0].remaining` is `3`",
    "`snapshot.effects.length` is still `0`",
    "`rewound.effects[0].remaining` is `10`",
    "`rewound.effects[0].expiresAt` is `18`",
    "`early.effects[0].remaining` is `18`",
    "`lost.effects.length` is `0`"
  ]) {
    assert.equal(readme.includes(phrase), true, phrase);
  }
});

test("source files do not contain comments, clocks, timers, or network calls", () => {
  const files = readdirSync(new URL("src/", root)).sort();
  assert.deepEqual(files, ["constants.js", "index.js", "read.js", "shape.js", "stack.js"]);
  for (const name of files) {
    const source = readFileSync(new URL("src/" + name, root), "utf8");
    const specifiers = source.match(/from "[^"]+"/g) ?? [];
    assert.equal(specifiers.length > 0 || !source.includes("import "), true, name);
    for (const specifier of specifiers) {
      assert.match(specifier, /^from "\.\/[a-z]+\.js"$/);
    }
    assert.equal(source.includes("node:"), false, name);
    assert.equal(source.includes("require("), false, name);
    assert.equal(source.includes("/*"), false, name);
    assert.equal(source.includes("//"), false, name);
    for (const token of [
      "Date",
      "setTimeout",
      "setInterval",
      "Math.random",
      "process",
      "fetch(",
      "globalThis",
      "queueMicrotask",
      "setImmediate",
      "performance",
      "console"
    ]) {
      assert.equal(source.includes(token), false, name + " " + token);
    }
  }
});

test("ci runs lint, format, and tests on node 20 and 22", () => {
  const ci = readFileSync(new URL(".github/workflows/ci.yml", root), "utf8");
  assert.equal(ci.includes("node-version: [20, 22]"), true);
  assert.equal(ci.includes("npm ci"), true);
  assert.equal(ci.includes("npm test"), true);
  assert.equal(ci.includes("npm run lint"), true);
  assert.equal(ci.includes("npm run format:check"), true);
});

test("the lockfile resolves only from the npm registry", () => {
  const lockPath = new URL("package-lock.json", root);
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  assert.equal(lock.lockfileVersion >= 2, true);
  const text = readFileSync(lockPath, "utf8");
  assert.equal(text.includes("git+"), false);
  assert.equal(text.includes("github:"), false);
  let resolved = 0;
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (value !== null && typeof value === "object") {
      if (typeof value.resolved === "string") {
        resolved += 1;
        assert.equal(
          value.resolved.startsWith("https://registry.npmjs.org/"),
          true,
          value.resolved
        );
      }
      for (const key of Object.keys(value)) {
        walk(value[key]);
      }
    }
  };
  walk(lock);
  assert.equal(resolved > 0, true);
});
