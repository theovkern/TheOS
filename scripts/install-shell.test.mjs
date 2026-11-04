import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE_BLOCK, withPoshGit } from "./install-shell.mjs";

test("an empty profile gets the lazy posh-git completer", () => {
  assert.equal(withPoshGit(""), PROFILE_BLOCK);
});

test("existing profile content is kept below the completer", () => {
  const out = withPoshGit("function cc { & claude @args }\n");
  assert.ok(out.startsWith(PROFILE_BLOCK));
  assert.ok(out.endsWith("function cc { & claude @args }\n"));
});

test("the old eager import is swapped for the lazy completer in place", () => {
  const eager = "Import-Module posh-git\n$GitPromptSettings.EnablePromptStatus = $false\n\nSet-Alias -Name cc -Value claude\n";
  assert.equal(withPoshGit(eager), PROFILE_BLOCK + "\nSet-Alias -Name cc -Value claude\n");
});

test("a profile that imports posh-git its own way is left alone", () => {
  const profile = "import-module Posh-Git\nfunction cc { & claude @args }\n";
  assert.equal(withPoshGit(profile), profile);
});

test("running twice changes nothing the second time", () => {
  for (const start of ["", "function cc { & claude @args }\n", "Import-Module posh-git\n$GitPromptSettings.EnablePromptStatus = $false\n"]) {
    const once = withPoshGit(start);
    assert.equal(withPoshGit(once), once);
  }
});
