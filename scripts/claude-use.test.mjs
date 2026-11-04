import { test } from "node:test";
import assert from "node:assert/strict";
import { swap } from "./claude-use.mjs";

const personal = { credentials: { claudeAiOauth: { refreshToken: "p" } }, oauthAccount: { emailAddress: "me@home" } };
const work = { credentials: { claudeAiOauth: { refreshToken: "w" } }, oauthAccount: { emailAddress: "me@work" } };

test("switching loads the target's login and account", () => {
  const out = swap({ active: "personal", target: "work", credentials: personal.credentials, config: { other: 1, oauthAccount: personal.oauthAccount }, stash: { work } });
  assert.deepEqual(out.credentials, work.credentials);
  assert.deepEqual(out.config, { other: 1, oauthAccount: work.oauthAccount });
  assert.equal(out.needsLogin, false);
});

test("switching saves the current login, so a rotated token is not lost", () => {
  const rotated = { claudeAiOauth: { refreshToken: "p2" } };
  const out = swap({ active: "personal", target: "work", credentials: rotated, config: { oauthAccount: personal.oauthAccount }, stash: { personal, work } });
  assert.deepEqual(out.stash.personal, { credentials: rotated, oauthAccount: personal.oauthAccount });
});

test("an account with no saved login logs out and asks for /login", () => {
  const out = swap({ active: "personal", target: "work", credentials: personal.credentials, config: { other: 1, oauthAccount: personal.oauthAccount }, stash: {} });
  assert.equal(out.credentials, null);
  assert.deepEqual(out.config, { other: 1 });
  assert.equal(out.needsLogin, true);
  assert.deepEqual(out.stash.personal, personal);
});

test("when logged out, nothing is stashed over the saved login", () => {
  const out = swap({ active: "personal", target: "work", credentials: null, config: {}, stash: { personal, work } });
  assert.deepEqual(out.stash.personal, personal);
});
