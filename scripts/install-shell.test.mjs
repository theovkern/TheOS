import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE_LINES, withPoshGit } from "./install-shell.mjs";

test("an empty profile gets posh-git", () => {
  assert.equal(withPoshGit(""), PROFILE_LINES.join("\n") + "\n");
});

test("existing profile content is kept below the posh-git lines", () => {
  const out = withPoshGit("function cc { & claude @args }\n");
  assert.ok(out.startsWith("Import-Module posh-git\n"));
  assert.ok(out.endsWith("function cc { & claude @args }\n"));
});

test("a profile that already imports posh-git is left alone", () => {
  const profile = "import-module Posh-Git\nfunction cc { & claude @args }\n";
  assert.equal(withPoshGit(profile), profile);
});

test("running twice changes nothing the second time", () => {
  const once = withPoshGit("function cc { & claude @args }\n");
  assert.equal(withPoshGit(once), once);
});
