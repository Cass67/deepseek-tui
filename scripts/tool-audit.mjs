/**
 * Report the tools the composition ACTUALLY registers, by standing up a stub
 * OpenAI-compatible endpoint, pointing the harness at it, and reading the tool
 * schemas off the request the harness sends. Mounting a plugin does not
 * guarantee its tools register — several need a provider or a config flag —
 * so this measures rather than infers.
 *
 * Usage: node scripts/tool-audit.mjs
 */
import { HarnessClient } from "@deepseek-ai/dsh-sdk-client";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TOOL_AUDIT_PORT ?? 8099);
const probeConfig = resolve(APP_ROOT, "_tool-audit.cordis.yml");
let captured = null;

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const json = (payload) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (req.url.includes("/models")) {
      return json({
        object: "list",
        data: [{ id: "router", object: "model" }],
      });
    }
    try {
      const parsed = JSON.parse(body);
      if (parsed.tools) {
        captured ??= parsed.tools.map((t) => t.function?.name ?? t.name).sort();
      }
    } catch {
      // A non-JSON body is not a tool-carrying request; ignore it.
    }
    json({
      id: "chatcmpl-audit",
      object: "chat.completion",
      model: "router",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  });
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// The config must live inside the repo or its plugin names will not resolve.
writeFileSync(
  probeConfig,
  readFileSync(resolve(APP_ROOT, "cordis.yml"), "utf8").replaceAll(
    "http://localhost:3200/v1",
    `http://127.0.0.1:${PORT}/v1`,
  ),
);

const client = new HarnessClient({
  command: "node",
  args: [
    resolve(
      APP_ROOT,
      "node_modules/@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/bin.js",
    ),
    probeConfig,
  ],
  cwd: APP_ROOT,
});
try {
  client.start();
  await client.initialize({
    cwd: APP_ROOT,
    provider: "local-llm-router",
    model: "router",
    maxTokens: 256,
  });
  // MCP servers connect asynchronously and register their tools late, so
  // give them a moment before the turn that captures the schema list.
  await new Promise((r) =>
    setTimeout(r, Number(process.env.TOOL_AUDIT_SETTLE_MS ?? 8000)),
  );
  await client.prompt(`tool-audit-${Date.now()}`, [
    { type: "text", text: "hi" },
  ]);
  await new Promise((r) => setTimeout(r, 4000));
} finally {
  await client.close().catch(() => {});
  server.close();
  unlinkSync(probeConfig);
}

if (!captured) {
  console.error("no tool schemas captured — did the turn reach the LLM seam?");
  process.exit(1);
}
console.log(`${captured.length} tools registered:\n`);
for (const name of captured) console.log(" ", name);
process.exit(0);
