/**
 * Live pty test: boot the TUI, run a workflow, and verify the workflow panel
 * renders.
 *
 * Usage: node scripts/pty-workflow-test.mjs
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PROMPT =
  "Use the workflow tool to run a simple workflow with one step labeled 'hello'. Then stop.";

const wrapperPath = "/tmp/pty-workflow-wrapper.sh";
const wrapper = `#!/bin/sh
stty rows 40 cols 120 2>/dev/null || true
( sleep 6; printf '%s\\r' "${PROMPT.replace(/"/g, '\\"')}"; sleep 50 ) | bun src/index.tsx
`;
writeFileSync(wrapperPath, wrapper, { mode: 0o755 });

const logPath = "/tmp/pty-workflow.log";
const log = spawn("script", ["-q", logPath, wrapperPath], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});

let out = "";
log.stdout.on("data", (d) => (out += d.toString()));
log.stderr.on("data", (d) => (out += d.toString()));

const pid = log.pid;
await sleep(62_000);
try {
  process.kill(pid, "SIGKILL");
} catch {}
await sleep(500);

const clean = out
  .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
  .replace(/\x1b\][^\x07]*\x07/g, "")
  .replace(/\x1b[()][0-9A-B]/g, "");

const hasWorkflowPanel = /workflow\s*\d/.test(clean) || /hello-step/.test(clean);
const hasStep = /hello/.test(clean);

console.log("=== WORKFLOW TEST RESULTS ===");
console.log("workflow panel rendered:", hasWorkflowPanel);
console.log("step visible:", hasStep);
console.log("log size:", out.length, "bytes");

process.exit(hasWorkflowPanel ? 0 : 1);
