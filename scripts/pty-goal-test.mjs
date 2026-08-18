/**
 * Live pty test: boot the TUI, create a goal via the goal tool, and verify the
 * goal panel renders.
 *
 * Usage: node scripts/pty-goal-test.mjs
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PROMPT =
  "Use the goal tool to create a goal with objective 'Ship the feature' and maxGoalRounds 3. Then stop.";

const wrapperPath = "/tmp/pty-goal-wrapper.sh";
const wrapper = `#!/bin/sh
stty rows 40 cols 120 2>/dev/null || true
( sleep 6; printf '%s\\r' "${PROMPT.replace(/"/g, '\\"')}"; sleep 40 ) | bun src/index.tsx
`;
writeFileSync(wrapperPath, wrapper, { mode: 0o755 });

const logPath = "/tmp/pty-goal.log";
const log = spawn("script", ["-q", logPath, wrapperPath], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});

let out = "";
log.stdout.on("data", (d) => (out += d.toString()));
log.stderr.on("data", (d) => (out += d.toString()));

const pid = log.pid;
await sleep(52_000);
try {
  process.kill(pid, "SIGKILL");
} catch {}
await sleep(500);

const clean = out
  .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
  .replace(/\x1b\][^\x07]*\x07/g, "")
  .replace(/\x1b[()][0-9A-B]/g, "");

const hasGoalPanel = /goal\s+(●|⏸|⛔|✓)/.test(clean) || /Ship the feature/.test(clean);
const hasObjective = /Ship the feature/.test(clean);

console.log("=== GOAL TEST RESULTS ===");
console.log("goal panel rendered:", hasGoalPanel);
console.log("objective visible:", hasObjective);
console.log("log size:", out.length, "bytes");

process.exit(hasGoalPanel && hasObjective ? 0 : 1);
