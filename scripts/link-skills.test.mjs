import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { after, describe, it } from "node:test";
import { applyPlan, discoverSkills, planLinks } from "./link-skills.mjs";

describe("planLinks", () => {
  it("plans every skill once per destination", () => {
    const { links, errors } = planLinks({ mine: "/src/mine", yours: "/src/yours" }, ["/claude", "/agents"]);

    assert.deepEqual(errors, []);
    assert.equal(links.length, 4);
    for (const destination of ["/claude", "/agents"]) {
      const names = links.filter((l) => l.destination === destination).map((l) => l.name).sort();
      assert.deepEqual(names, ["mine", "yours"]);
    }
  });

  it("refuses to link a reserved directory name", () => {
    const { links, errors } = planLinks({ synced: "/src/synced" }, ["/dest"]);

    assert.deepEqual(links, []);
    assert.match(errors[0], /reserved directory name/);
  });

  it("keeps a reserved name from blocking the rest of the plan", () => {
    const { links, errors } = planLinks({ synced: "/src/synced", fine: "/src/fine" }, ["/dest"]);

    assert.equal(errors.length, 1);
    assert.deepEqual(links.map((l) => l.name), ["fine"]);
  });

  it("plans nothing when there are no skills", () => {
    assert.deepEqual(planLinks({}, ["/dest"]), { links: [], errors: [] });
  });
});

describe("applyPlan", () => {
  const roots = [];
  const makeRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "theos-link-"));
    roots.push(root);
    return root;
  };

  after(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  const makeSkill = (root, name) => {
    const dir = join(root, "src", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `# ${name}\n`);
    return dir;
  };

  const planFor = (root, name, destination) => [
    { name, from: makeSkill(root, name), to: join(destination, name), destination },
  ];

  it("creates a destination that does not exist yet", () => {
    const root = makeRoot();
    const destination = join(root, "not", "there", "yet");

    applyPlan(planFor(root, "alpha", destination));

    assert.ok(existsSync(join(destination, "alpha", "SKILL.md")));
  });

  it("replaces a real directory at the target and keeps the old copy outside the skills folder", () => {
    const root = makeRoot();
    const destination = join(root, "dest");
    const inTheWay = join(destination, "beta");
    mkdirSync(inTheWay, { recursive: true });
    writeFileSync(join(inTheWay, "SKILL.md"), "# hand written\n");

    const [result] = applyPlan(planFor(root, "beta", destination));

    assert.match(result.action, /^replaced/);
    assert.ok(lstatSync(inTheWay).isSymbolicLink(), "target is now a link");
    const aside = result.action.match(/kept at (.+)\)$/)[1];
    assert.ok(existsSync(join(aside, "SKILL.md")), "the old copy survives");
    assert.ok(!aside.startsWith(destination + sep), "the backup sits outside the skills folder");
    assert.deepEqual(readdirSync(destination), ["beta"], "nothing but links in the skills folder");
  });

  it("leaves a correct link alone and is idempotent", () => {
    const root = makeRoot();
    const destination = join(root, "dest");
    const plan = planFor(root, "gamma", destination);

    const [first] = applyPlan(plan);
    const [second] = applyPlan(plan);
    const [third] = applyPlan(plan);

    assert.equal(first.action, "created");
    assert.equal(second.action, "unchanged");
    assert.equal(third.action, "unchanged");
    assert.equal(resolve(readlinkSync(join(destination, "gamma"))), resolve(plan[0].from));
  });

  it("repoints a link that aims somewhere else", () => {
    const root = makeRoot();
    const destination = join(root, "dest");

    applyPlan(planFor(root, "delta", destination));
    const moved = makeSkill(root, "delta-moved");
    const [result] = applyPlan([{ name: "delta", from: moved, to: join(destination, "delta"), destination }]);

    assert.equal(result.action, "relinked");
    assert.equal(resolve(readlinkSync(join(destination, "delta"))), resolve(moved));
  });

  it("changes nothing on a dry run", () => {
    const root = makeRoot();
    const destination = join(root, "dest");

    applyPlan(planFor(root, "epsilon", destination), { dryRun: true });

    assert.ok(!existsSync(join(destination, "epsilon")));
  });
});

describe("discoverSkills", () => {
  it("finds skills nested under category folders and ignores dotfolders", () => {
    const root = mkdtempSync(join(tmpdir(), "theos-discover-"));
    mkdirSync(join(root, "engineering", "tdd"), { recursive: true });
    writeFileSync(join(root, "engineering", "tdd", "SKILL.md"), "# tdd\n");
    mkdirSync(join(root, "flat"), { recursive: true });
    writeFileSync(join(root, "flat", "SKILL.md"), "# flat\n");
    mkdirSync(join(root, ".hidden", "ignored"), { recursive: true });
    writeFileSync(join(root, ".hidden", "ignored", "SKILL.md"), "# ignored\n");

    const found = discoverSkills(root);

    assert.deepEqual(Object.keys(found).sort(), ["flat", "tdd"]);
    rmSync(root, { recursive: true, force: true });
  });

  it("returns nothing for a directory that does not exist", () => {
    assert.deepEqual(discoverSkills(join(tmpdir(), "theos-definitely-absent")), {});
  });
});
