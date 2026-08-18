// Boot test: launch the harness subprocess with a given cordis.yml, send
// `initialize`, and report whether the runtime booted (all plugins loaded).
// Usage: node scripts/boot-test.mjs [path/to/cordis.yml]
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = process.argv[2] ?? resolve(APP_ROOT, "cordis.yml");
const bin = resolve(
  APP_ROOT,
  "node_modules/@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/bin.js",
);
const cwd = process.env.DSH_CWD ?? process.cwd();

const provider = process.env.DSH_PROVIDER ?? "qwen-token-plan";
const model = process.env.DSH_MODEL ?? "qwen3.8-max-preview";

const child = spawn("node", [bin, config], {
  cwd,
  env: {
    ...process.env,
    DSH_CWD: cwd,
    DSH_SESSION_ROOT: `${cwd}/.sessions`,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (d) => (stderr += d.toString()));

let buffer = "";
let done = false;
const timer = setTimeout(() => {
  if (!done) {
    done = true;
    console.log("TIMEOUT: no response within 20s");
    console.log("--- stderr ---\n" + stderr);
    child.kill();
    process.exit(2);
  }
}, 20000);

function handleFrame(frame) {
  if (frame.id === 1) {
    if (frame.error) {
      console.log("INIT ERROR:", JSON.stringify(frame.error));
      finish(1);
    } else {
      console.log("BOOT OK: initialize returned a result");
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "command/list",
          params: { sessionId: "boot-test" },
        }) + "\n",
      );
    }
    return;
  }
  if (frame.id === 3) {
    if (frame.error) {
      console.log("COMMAND/LIST ERROR:", JSON.stringify(frame.error));
      finish(1);
    } else {
      const list = frame.result?.commands ?? frame.result ?? [];
      const cmds = list.map((c) =>
        typeof c === "string" ? c : (c.name ?? c.command ?? JSON.stringify(c)),
      );
      console.log("COMMANDS (" + cmds.length + "):", cmds.join(", "));
      finish(0);
    }
    return;
  }
}

child.stdout.on("data", (d) => {
  buffer += d.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      continue;
    }
    handleFrame(frame);
    if (done) return;
  }
});

function finish(code) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }) +
      "\n",
  );
  setTimeout(() => {
    child.kill();
    process.exit(code);
  }, 500);
}

child.on("exit", (code) => {
  if (!done) {
    done = true;
    clearTimeout(timer);
    console.log(`PROCESS EXITED early with code ${code}`);
    console.log("--- stderr ---\n" + stderr);
    process.exit(code ?? 3);
  }
});

// Give the runtime a moment to boot, then send initialize.
setTimeout(() => {
  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { cwd, provider, model },
    }) + "\n",
  );
}, 1500);
