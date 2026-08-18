/**
 * Live pty test: boot the TUI, send a prompt that triggers a subagent and a
 * background job, then verify the subagents/jobs panels render.
 *
 * Usage: node scripts/pty-panel-test.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PROMPT =
  "Do two things in one turn: (1) call the subagent tool with description 'probe' and prompt 'reply OK'; (2) call the bash tool with run_in_background true running 'sleep 1 && echo bg'. Then call job_list once. Stop after that.";

// Write a wrapper shell script: fixed size, feed the prompt after boot.
const wrapperPath = "/tmp/pty-panel-wrapper.sh";
const wrapper = `#!/bin/sh
stty rows 40 cols 120 2>/dev/null || true
( sleep 6; printf '%s\\r' "${PROMPT.replace(/"/g, '\\"')}"; sleep 45 ) | bun src/index.tsx
`;
writeFileSync(wrapperPath, wrapper, { mode: 0o755 });

const logPath = "/tmp/pty-panel.log";
const log = spawn("script", ["-q", logPath, wrapperPath], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});

let out = "";
log.stdout.on("data", (d) => (out += d.toString()));
log.stderr.on("data", (d) => (out += d.toString()));

const pid = log.pid;
await sleep(58_000);
try {
  process.kill(pid, "SIGKILL");
} catch {}
await sleep(500);

// Strip ANSI escapes for inspection.
const clean = out
  .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
  .replace(/\x1b\][^\x07]*\x07/g, "")
  .replace(/\x1b[()][0-9A-B]/g, "");

// The panels render as bordered boxes with a header + per-item rows. The
// per-item rows carry the subagent description and the job id, which are the
// reliable signals (the headers get garbled by cursor-movement escapes).
const hasSubagentsPanel = /probe/.test(clean);
const hasJobsPanel = /bash-1 \[bash\]/.test(clean);

console.log("=== PANEL TEST RESULTS ===");
console.log("subagents panel rendered (probe row):", hasSubagentsPanel);
console.log("jobs panel rendered (bash-1 row):", hasJobsPanel);
console.log("log size:", out.length, "bytes");

process.exit(hasSubagentsPanel && hasJobsPanel ? 0 : 1);
