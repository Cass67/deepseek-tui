// Verify settings/get -> settings/set -> settings/get actually round-trips.
import { HarnessClient } from "@deepseek-ai/dsh-sdk-client";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Settings namespaces register asynchronously AFTER initialize resolves, so a
 * single read intermittently sees none. Poll to a deadline instead.
 */
async function readNamespace(client, ns, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await client.getSettings()).namespaces.find(
      (n) => n.ns === ns,
    );
    if (found) return found;
    if (Date.now() >= deadline)
      throw new Error(`namespace ${ns} never registered`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

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

const ns = await readNamespace(client, "agent-default-model");
console.log("before:", JSON.stringify(ns.value), "rev", ns.revision);

// Write something guaranteed to DIFFER from the stored value: patching a
// namespace to what it already holds is a no-op and never advances the
// revision, which would make this check pass or fail by coincidence.
const probeModel = `${ns.value.model}-roundtrip-probe`;
const written = await client.setSettings({
  namespace: "agent-default-model",
  patch: { provider: ns.value.provider, model: probeModel },
  expectedRevision: ns.revision,
});
console.log(
  "after set:",
  JSON.stringify(written.value),
  "rev",
  written.revision,
);
assert.equal(written.value.model, probeModel);
assert.ok(written.revision > ns.revision, "revision must advance");

const ns2 = await readNamespace(client, "agent-default-model");
assert.equal(ns2.value.model, probeModel, "read-back must see the write");

// restore
await client.setSettings({
  namespace: "agent-default-model",
  patch: ns.value,
  expectedRevision: ns2.revision,
});
console.log("restored. settings/set round-trip OK");
await client.close();
process.exit(0);
