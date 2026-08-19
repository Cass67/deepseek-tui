/**
 * Verify the remembered route survives a process restart: one harness process
 * writes it, a second, freshly spawned one reads it back.
 *
 * Usage: node scripts/route-persistence-check.mjs
 */
import { HarnessClient } from "@deepseek-ai/dsh-sdk-client";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NS = "agent-default-model";

function connect() {
  const client = new HarnessClient({
    command: "node",
    args: [
      resolve(
        APP_ROOT,
        "node_modules/@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/bin.js",
      ),
      resolve(APP_ROOT, "cordis.yml"),
    ],
    cwd: APP_ROOT,
  });
  client.start();
  return client;
}
// Namespaces register asynchronously after initialize resolves, so poll.
const read = async (c) => {
  const deadline = Date.now() + 3000;
  for (;;) {
    const found = (await c.getSettings()).namespaces.find((n) => n.ns === NS);
    if (found) return found;
    if (Date.now() >= deadline)
      throw new Error(`namespace ${NS} never registered`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

const a = connect();
await a.initialize({
  cwd: APP_ROOT,
  provider: "qwen-token-plan",
  model: "qwen3.8-max-preview",
  maxTokens: 512,
});
const before = await read(a);
console.log(
  "process A sees:",
  JSON.stringify(before.value),
  "rev",
  before.revision,
);
await a.setSettings({
  namespace: NS,
  patch: { provider: "local-llm-router", model: "router" },
  expectedRevision: before.revision,
});
await a.close();
// The settings file is written as the process winds down; a fresh harness
// started too eagerly can read the file before that write lands.
await new Promise((r) => setTimeout(r, 750));

const b = connect();
await b.initialize({
  cwd: APP_ROOT,
  provider: "qwen-token-plan",
  model: "qwen3.8-max-preview",
  maxTokens: 512,
});
const after = await read(b);
console.log(
  "process B sees:",
  JSON.stringify(after.value),
  "rev",
  after.revision,
);
assert.equal(
  after.value.provider,
  "local-llm-router",
  "route did not survive the restart",
);
assert.equal(after.value.model, "router");
await b.close();
console.log("\nOK: remembered route survived a process restart");
process.exit(0);
