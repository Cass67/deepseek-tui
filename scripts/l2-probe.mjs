/**
 * Probe which L2 methods the harness responds to.
 * Usage: node scripts/l2-probe.mjs
 */
import { HarnessClient } from "@deepseek-ai/dsh-sdk-client";
import { resolve } from "node:path";

const APP_ROOT = resolve(import.meta.dirname, "..");
const HARNESS_BIN =
  process.env.DSH_HARNESS_BIN ??
  resolve(APP_ROOT, "node_modules/@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/bin.js");
const CORDIS_CONFIG =
  process.env.DSH_CORDIS_CONFIG ?? resolve(APP_ROOT, "cordis.yml");

const client = new HarnessClient({
  command: "node",
  args: [HARNESS_BIN, CORDIS_CONFIG],
  cwd: APP_ROOT,
});
client.start();
await client.initialize({
  cwd: APP_ROOT,
  provider: "qwen-token-plan",
  model: "qwen3.8-max-preview",
  maxTokens: 8192,
});

const methods = [
  "skills/list",
  "settings/get",
  "settings/set",
  "agent-presets/list",
  "goal/get",
  "goal/list",
  "mcp/list",
  "lsp/status",
  "workflow/list",
  "trajectory/list",
  "deliverables/list",
];

for (const method of methods) {
  try {
    const result = await client.request(method, {}, 3000);
    const summary = JSON.stringify(result);
    console.log(`OK   ${method} -> ${summary.slice(0, 120)}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`FAIL ${method} -> ${msg.slice(0, 80)}`);
  }
}

await client.close();
process.exit(0);
