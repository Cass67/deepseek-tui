/**
 * Live pty test: flood the transcript on a short terminal, then check the
 * composer is still drawn. Regression guard for the chat scrollbox winning the
 * flex negotiation and squeezing the composer to zero rows (keystrokes still
 * land, nothing renders).
 *
 * Usage: node scripts/pty-composer-test.mjs
 */
/* eslint-disable no-control-regex, no-empty -- pty logs are raw ANSI; the kill may race the exit. */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PROMPT =
  "Print the numbers 1 through 120, one per line, nothing else. Do not call any tool.";

const wrapperPath = "/tmp/pty-composer-wrapper.sh";
writeFileSync(
  wrapperPath,
  `#!/bin/sh
stty rows 20 cols 100 2>/dev/null || true
( sleep 6; printf '%s\\r' "${PROMPT.replace(/"/g, '\\"')}"; sleep 75; printf '/hel'; sleep 6 ) | bun src/index.tsx
`,
  { mode: 0o755 },
);

const log = spawn("script", ["-q", "/tmp/pty-composer.log", wrapperPath], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
log.stdout.on("data", (d) => (out += d.toString()));
log.stderr.on("data", (d) => (out += d.toString()));

await sleep(92_000);
try {
  process.kill(log.pid, "SIGKILL");
} catch {}
await sleep(500);

const clean = out
  .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
  .replace(/\x1b\][^\x07]*\x07/g, "")
  .replace(/\x1b[()][0-9A-B]/g, "");
// Only the tail matters: the composer has to survive a full transcript.
const tail = clean.slice(-6000);
const transcriptFilled = clean.includes("118");
const composerVisible =
  /\/help/.test(tail) || /Tab completes first match/.test(tail);

console.log("=== COMPOSER TEST RESULTS ===");
console.log("transcript filled the screen:", transcriptFilled);
console.log("composer still rendered after flood:", composerVisible);
console.log("log size:", out.length, "bytes");

process.exit(transcriptFilled && composerVisible ? 0 : 1);
