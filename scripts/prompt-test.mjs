// Live prompt test: boot the harness, send a prompt that should trigger a
// model-facing tool call, and report which tools the model invoked.
// Usage: node scripts/prompt-test.mjs [prompt]
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = resolve(APP_ROOT, "cordis.yml");
const bin = resolve(APP_ROOT, "node_modules/@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/bin.js");
const cwd = process.env.DSH_CWD ?? process.cwd();

const provider = process.env.DSH_PROVIDER ?? "local-llm-router";
const model = process.env.DSH_MODEL ?? "router";
const prompt = process.argv[2] ??
  "Your only task: call the glob tool with pattern '**/*.ts' to list TypeScript files. Make the tool call as your first action.";

const child = spawn("node", [bin, config], {
  cwd,
  env: { ...process.env, DSH_CWD: cwd, DSH_SESSION_ROOT: `${cwd}/.sessions` },
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (d) => (stderr += d.toString()));

let buffer = "";
let done = false;
const toolCalls = [];
const assistantText = [];
const reasoningText = [];
let nextId = 10;

const timer = setTimeout(() => {
  if (!done) {
    done = true;
    console.log("TIMEOUT after 90s");
    report();
    child.kill();
    process.exit(2);
  }
}, 90000);

function report() {
  console.log("\n=== TOOL CALLS ===");
  if (toolCalls.length === 0) console.log("(none)");
  for (const tc of toolCalls) console.log(" -", tc.name, JSON.stringify(tc.args ?? {}).slice(0, 120));
  if (toolCalls[0]?.raw) console.log("\nRAW tool/call event:\n" + JSON.stringify(toolCalls[0].raw, null, 2).slice(0, 800));
  const text = assistantText.join("").trim();
  if (text) console.log("\n=== ASSISTANT (truncated) ===\n" + text.slice(0, 400));
  const reasoning = reasoningText.join("").trim();
  if (reasoning) console.log("\n=== REASONING (truncated) ===\n" + reasoning.slice(0, 1500));
}

function finish(code) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  report();
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }) + "\n");
  setTimeout(() => { child.kill(); process.exit(code); }, 500);
}

function handleFrame(frame) {
  if (frame.id === 1) {
    if (frame.error) { console.log("INIT ERROR:", JSON.stringify(frame.error)); finish(1); return; }
    console.log("BOOT OK; sending prompt...");
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: nextId++, method: "session/prompt",
      params: { sessionId: `prompt-test-${Date.now()}`, contentBlocks: [{ type: "text", text: prompt }] },
    }) + "\n");
    return;
  }
  if (frame.method === "session.event") {
    const ev = frame.params?.event ?? frame.params ?? {};
    const type = ev.type ?? ev.kind;
    if (type === "assistant/chunk") {
      const c = ev.data?.chunk ?? {};
      if (c.type === "reasoning-delta" || c.type === "text-delta") {
        if (c.type === "text-delta") assistantText.push(c.text ?? "");
        else reasoningText.push(c.text ?? "");
      }
      return;
    }
    if (type) console.log("event:", type);
    if (type === "tool/call") {
      toolCalls.push({ name: ev.name ?? ev.toolName ?? ev.tool, args: ev.args ?? ev.input ?? ev.params, raw: ev });
    } else if (type === "assistant/text" || type === "message/assistant-text" || ev.text) {
      if (typeof ev.text === "string") assistantText.push(ev.text);
    }
    // Stop once the agent goes idle after at least one tool call or a final message.
    if ((type === "agent/idle" || type === "session/idle" || type === "run/end" || type === "tool-workflow/run-end") && (toolCalls.length > 0 || assistantText.length > 0)) {
      finish(0);
    }
    return;
  }
  if (frame.method === "session.status") {
    const status = frame.params?.status;
    if (status === "idle" && (toolCalls.length > 0 || assistantText.length > 0)) finish(0);
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
    try { frame = JSON.parse(line); } catch { continue; }
    handleFrame(frame);
    if (done) return;
  }
});

child.on("exit", (code) => {
  if (!done) { done = true; clearTimeout(timer); console.log(`PROCESS EXITED code ${code}`); console.log("--- stderr ---\n" + stderr.slice(-2000)); report(); process.exit(code ?? 3); }
});

setTimeout(() => {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { cwd, provider, model } }) + "\n");
}, 1500);
