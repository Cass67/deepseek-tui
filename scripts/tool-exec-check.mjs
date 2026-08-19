/**
 * Execute specific tools end to end without a live model: a stub LLM endpoint
 * answers the first request with a tool_call and the harness runs it for real.
 * Registration is not execution -- this checks the tool actually works.
 *
 * Usage: node scripts/tool-exec-check.mjs [toolName ...]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TOOL_EXEC_PORT ?? 8098);
const BIN = resolve(
  APP_ROOT,
  "node_modules/@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/bin.js",
);
const probeConfig = resolve(APP_ROOT, "_tool-exec.cordis.yml");

const ALL = {
  terminal_open: { type: "shell", name: "exec-check" },
  session_search: { query: "harness" },
  lsp: { operation: "hover", file_path: "src/App.tsx", line: 1, character: 1 },
  web_fetch: { url: "https://example.com" },
  run_code: { description: "trivial arithmetic", code: "1 + 1" },
  schedule_list: {},
};
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(ALL);

let pending = null;
let servedCall = false;
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    if (req.url.includes("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "router", object: "model" }],
        }),
      );
    }
    // The harness always requests stream:true, so a plain JSON body is
    // unparseable to it and simply triggers a retry.
    const call = !servedCall && pending;
    servedCall = true;
    const delta = call
      ? {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: {
                name: pending,
                arguments: JSON.stringify(ALL[pending]),
              },
            },
          ],
        }
      : { role: "assistant", content: "done" };
    const frame = (d, finish) =>
      `data: ${JSON.stringify({
        id: "chatcmpl-exec",
        object: "chat.completion.chunk",
        model: "router",
        choices: [{ index: 0, delta: d, finish_reason: finish ?? null }],
      })}\n\n`;
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(frame(delta));
    res.write(frame({}, call ? "tool_calls" : "stop"));
    res.write("data: [DONE]\n\n");
    res.end();
  });
});

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

writeFileSync(
  probeConfig,
  readFileSync(resolve(APP_ROOT, "cordis.yml"), "utf8").replaceAll(
    "http://localhost:3200/v1",
    `http://127.0.0.1:${PORT}/v1`,
  ),
);

function runCase(name) {
  return new Promise((done) => {
    pending = name;
    servedCall = false;
    const child = spawn("node", [BIN, probeConfig], {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        DSH_CWD: APP_ROOT,
        DSH_SESSION_ROOT: `${APP_ROOT}/.sessions`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "",
      outcome = "no tool/result observed",
      settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      child.kill();
      done(outcome);
    };
    const timer = setTimeout(finish, 25000);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let frame;
        try {
          frame = JSON.parse(line);
        } catch {
          continue;
        }
        if (frame.id === 1) {
          if (frame.error) {
            outcome = `init error: ${JSON.stringify(frame.error).slice(0, 90)}`;
            clearTimeout(timer);
            finish();
            return;
          }
          child.stdin.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "session/prompt",
              params: {
                sessionId: `exec-${name}-${Date.now()}`,
                contentBlocks: [{ type: "text", text: "go" }],
              },
            }) + "\n",
          );
          continue;
        }
        const ev = frame.params?.event ?? frame.params ?? {};
        if (ev.type === "tool/result") {
          const text = JSON.stringify(ev.data ?? {});
          outcome = `${text.includes('"isError":true') ? "ERROR" : "ok"}: ${text.slice(0, 400)}`;
          clearTimeout(timer);
          finish();
          return;
        }
      }
    });
    setTimeout(
      () =>
        child.stdin.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              cwd: APP_ROOT,
              provider: "local-llm-router",
              model: "router",
            },
          }) + "\n",
        ),
      1500,
    );
  });
}

let failures = 0;
for (const name of names) {
  const outcome = await runCase(name);
  if (!outcome.startsWith("ok")) failures++;
  console.log(`${name.padEnd(16)} ${outcome}`);
}
unlinkSync(probeConfig);
server.close();
process.exit(failures ? 1 : 0);
