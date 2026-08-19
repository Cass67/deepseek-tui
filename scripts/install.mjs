/**
 * Set up the harness this TUI links against.
 *
 * Every dependency except react and @opentui/* is a `link:` into a sibling
 * ../deepseek-harness checkout, and that repo gitignores `lib/` — so a fresh
 * clone resolves nothing until it has been installed AND built. This does the
 * whole sequence, and is safe to re-run.
 *
 * Usage:
 *   node scripts/install.mjs           # set up / repair
 *   node scripts/install.mjs --check   # report only, change nothing
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS =
  process.env.DSH_HARNESS_PATH ?? resolve(APP_ROOT, "..", "deepseek-harness");
const REPO =
  process.env.DSH_HARNESS_REPO ??
  "https://github.com/Cass67/deepseek-harness.git";
/**
 * A TAG, not a branch: a branch keeps moving, so two people running this on
 * different days would get different harness code with nothing to point at.
 */
const REF = process.env.DSH_HARNESS_REF ?? "v0.1.0-rc.8-l2";
/** The commit that adds the L2 runtime methods this client calls. */
const REQUIRED_COMMIT = "f5afaacf40";
const CHECK_ONLY = process.argv.includes("--check");

let step = 0;
const say = (msg) => console.log(`\n[${++step}] ${msg}`);
const ok = (msg) => console.log(`    ok — ${msg}`);

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\nfailed: ${cmd} ${args.join(" ")} (in ${cwd})`);
    process.exit(1);
  }
}
function capture(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// 1. The checkout itself.
say(`harness checkout at ${HARNESS}`);
if (!existsSync(HARNESS)) {
  if (CHECK_ONLY) {
    console.error(`    MISSING — run without --check to clone ${REPO}`);
    process.exit(1);
  }
  console.log(`    cloning ${REPO} at ${REF}`);
  run("git", ["clone", "--branch", REF, REPO, HARNESS], APP_ROOT);
} else {
  ok("present");
}

// 2. Does it contain the commit this client needs? Never rewrite someone's
//    checkout to get there — say what is wrong and let them decide.
say(`required commit ${REQUIRED_COMMIT}`);
const hasCommit =
  capture(
    "git",
    ["merge-base", "--is-ancestor", REQUIRED_COMMIT, "HEAD"],
    HARNESS,
  ) !== null;
if (!hasCommit) {
  const head =
    capture("git", ["rev-parse", "--short", "HEAD"], HARNESS) ?? "unknown";
  console.error(
    `    MISSING — the checkout is at ${head}, which does not contain ${REQUIRED_COMMIT}.\n` +
      `    Without it, settings/get, settings/set, skills/list and agent-presets/list\n` +
      `    do not exist: the TUI boots and then fails on the settings overlay, both\n` +
      `    pickers and last-model-restore.\n\n` +
      `    Fix with:  git -C ${HARNESS} fetch ${REPO} --tags && git -C ${HARNESS} checkout ${REF}`,
  );
  process.exit(1);
}
ok("present");

if (CHECK_ONLY) {
  // 3-5 mutate; in check mode just report whether the build output exists.
  say("built output");
  const built = existsSync(
    resolve(HARNESS, "packages/sdk/client/lib/index.js"),
  );
  console.log(
    built
      ? "    ok — lib/ present"
      : "    MISSING — run without --check to build",
  );
  process.exit(built ? 0 : 1);
}

// 3. Harness dependencies.
say("installing harness dependencies");
run("pnpm", ["install"], HARNESS);

// 4. The build. lib/ is gitignored, so this is not optional — without it every
//    `link:` dependency resolves to a package whose exports point at nothing.
say("building harness lib (this is the slow step)");
run("npm", ["run", "build:lib"], HARNESS);

// 5. This app.
say("installing TUI dependencies");
run("pnpm", ["install"], APP_ROOT);

say("verifying the harness exposes what this client calls");
run("node", [resolve(APP_ROOT, "scripts/preflight.mjs")], APP_ROOT);

console.log("\nReady. Start with ./bin/deepseek-tui\n");
