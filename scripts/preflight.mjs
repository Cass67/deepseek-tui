/**
 * Check the linked harness actually provides what this TUI calls.
 *
 * Every dependency is a `link:` into ../deepseek-harness, so the resolved code
 * is whatever is in that working tree — there is no version to pin, and a
 * checkout without the L2 methods boots fine and then fails at the first
 * settings read. This turns that into one clear message up front.
 *
 * Usage: node scripts/preflight.mjs
 */
import { HarnessClient } from "@deepseek-ai/dsh-sdk-client";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** L2 methods the TUI depends on, and what breaks without each. */
const REQUIRED = [
  ["settings/get", "settings overlay, last-model-restore"],
  ["settings/set", "settings overlay, agent-preset selection"],
  ["skills/list", "skill picker (Ctrl+K)"],
  ["agent-presets/list", "agent-preset picker (Ctrl+A)"],
];

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

const missing = [];
try {
  client.start();
  await client.initialize({
    cwd: APP_ROOT,
    provider: "local-llm-router",
    model: "router",
    maxTokens: 256,
  });
  for (const [method, breaks] of REQUIRED) {
    try {
      await client.request(method, {}, 5000);
    } catch (error) {
      // A bad-params error still proves the method EXISTS; only an unknown
      // method means the harness predates it.
      if (/unknown .*runtime method/i.test(String(error)))
        missing.push([method, breaks]);
    }
  }
} finally {
  await client.close().catch(() => {});
}

if (missing.length === 0) {
  console.log(
    `preflight OK — all ${REQUIRED.length} required L2 methods present`,
  );
  process.exit(0);
}
console.error("preflight FAILED — the linked harness is missing:\n");
for (const [method, breaks] of missing)
  console.error(`  ${method.padEnd(20)} breaks: ${breaks}`);
console.error(
  "\nThese are not in harness 0.1.0-rc.8. Check out a revision containing" +
    "\nthe v0.1.0-rc.8-l2 tag on github.com/Cass67/deepseek-harness)" +
    "\nin ../deepseek-harness, then re-run.",
);
process.exit(1);
