/**
 * Live pty test: boot the TUI, open the settings overlay (Ctrl+S), and verify
 * it renders.
 *
 * Usage: node scripts/pty-settings-test.mjs
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const wrapperPath = "/tmp/pty-settings-wrapper.sh";
const wrapper = `#!/bin/sh
stty rows 40 cols 120 2>/dev/null || true
( sleep 6; printf '\\023'; sleep 15 ) | bun src/index.tsx
`;
writeFileSync(wrapperPath, wrapper, { mode: 0o755 });

const logPath = "/tmp/pty-settings.log";
const log = spawn("script", ["-q", logPath, wrapperPath], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});

let out = "";
log.stdout.on("data", (d) => (out += d.toString()));
log.stderr.on("data", (d) => (out += d.toString()));

const pid = log.pid;
await sleep(24_000);
try {
  process.kill(pid, "SIGKILL");
} catch {}
await sleep(500);

const clean = out
  .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
  .replace(/\x1b\][^\x07]*\x07/g, "")
  .replace(/\x1b[()][0-9A-B]/g, "");

const hasSettings = /Settings/.test(clean);
const hasModel = /Model:/.test(clean);
const hasShortcuts = /Shortcuts:/.test(clean);

console.log("=== SETTINGS TEST RESULTS ===");
console.log("settings overlay rendered:", hasSettings);
console.log("model line visible:", hasModel);
console.log("shortcuts visible:", hasShortcuts);
console.log("log size:", out.length, "bytes");

process.exit(hasSettings && hasModel ? 0 : 1);
