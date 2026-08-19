// Verify settings/get -> settings/set -> settings/get actually round-trips.
import { HarnessClient } from "@deepseek-ai/dsh-sdk-client";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const APP_ROOT = "/Users/cass/git/deepseek-tui";
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
await client.initialize({
  cwd: APP_ROOT,
  provider: "qwen-token-plan",
  model: "qwen3.8-max-preview",
  maxTokens: 8192,
});

const before = await client.getSettings();
const ns = before.namespaces.find((n) => n.ns === "agent-default-model");
console.log("before:", JSON.stringify(ns.value), "rev", ns.revision);

const written = await client.setSettings({
  namespace: "agent-default-model",
  patch: { provider: "local-llm-router", model: "router" },
  expectedRevision: ns.revision,
});
console.log(
  "after set:",
  JSON.stringify(written.value),
  "rev",
  written.revision,
);
assert.equal(written.value.provider, "local-llm-router");
assert.ok(written.revision > ns.revision, "revision must advance");

const after = await client.getSettings();
const ns2 = after.namespaces.find((n) => n.ns === "agent-default-model");
assert.equal(ns2.value.model, "router", "read-back must see the write");

// restore
await client.setSettings({
  namespace: "agent-default-model",
  patch: ns.value,
  expectedRevision: ns2.revision,
});
console.log("restored. settings/set round-trip OK");
await client.close();
process.exit(0);
