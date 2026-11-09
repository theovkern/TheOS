import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFILE_BLOCK, withPoshGit } from "./install-shell.mjs";

test("an empty profile gets the idle-time posh-git import", () => {
  assert.equal(withPoshGit(""), PROFILE_BLOCK);
});

test("existing profile content is kept below the import", () => {
  const out = withPoshGit("function cc { & claude @args }\n");
  assert.ok(out.startsWith(PROFILE_BLOCK));
  assert.ok(out.endsWith("function cc { & claude @args }\n"));
});

const ON_TAB = `Register-ArgumentCompleter -Native -CommandName git, tgit, gitk -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    Import-Module posh-git -Global
    $GitPromptSettings.EnablePromptStatus = $false
    $line = $commandAst.Extent.Text
    $column = $cursorPosition - $commandAst.Extent.StartOffset
    (TabExpansion2 -inputScript $line.PadRight($column) -cursorColumn $column).CompletionMatches
}
`;

test("the old import-on-first-Tab completer is swapped for the idle-time import in place", () => {
  assert.equal(withPoshGit(ON_TAB + "\nSet-Alias -Name cc -Value claude\n"), PROFILE_BLOCK + "\nSet-Alias -Name cc -Value claude\n");
});

test("the old eager import is swapped for the idle-time import in place", () => {
  const eager = "Import-Module posh-git\n$GitPromptSettings.EnablePromptStatus = $false\n\nSet-Alias -Name cc -Value claude\n";
  assert.equal(withPoshGit(eager), PROFILE_BLOCK + "\nSet-Alias -Name cc -Value claude\n");
});

test("a profile that imports posh-git its own way is left alone", () => {
  const profile = "import-module Posh-Git\nfunction cc { & claude @args }\n";
  assert.equal(withPoshGit(profile), profile);
});

test("running twice changes nothing the second time", () => {
  for (const start of ["", "function cc { & claude @args }\n", "Import-Module posh-git\n$GitPromptSettings.EnablePromptStatus = $false\n", ON_TAB]) {
    const once = withPoshGit(start);
    assert.equal(withPoshGit(once), once);
  }
});
