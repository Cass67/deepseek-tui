import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { formatShellResult, ShellRunner } from "./shell.ts";

async function waitForPid(path: string): Promise<number> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      return Number.parseInt((await readFile(path, "utf8")).trim(), 10);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error("Timed out waiting for descendant pid");
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

test("formats results and bounded-output state visibly", () => {
  assert.equal(
    formatShellResult({
      command: "printf ok",
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      signal: null,
      outputTruncated: false,
    }),
    "$ printf ok\nok",
  );
  assert.match(
    formatShellResult({
      command: "sleep",
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: "SIGKILL",
      stopReason: "timeout",
      outputTruncated: true,
    }),
    /output truncated[\s\S]*timed out after 120s/,
  );
});

test("allows one active shell and cancellation kills its process tree", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "dsh-shell-cancel-"));
  const pidFile = join(cwd, "child.pid");
  const runner = new ShellRunner({ timeoutMs: 5_000, termGraceMs: 50 });
  const resultPromise = runner.run(
    `sleep 30 & echo $! > ${JSON.stringify(pidFile)}; wait`,
    cwd,
  );
  const descendantPid = await waitForPid(pidFile);
  assert.throws(() => runner.run("echo second", cwd), /already running/);
  assert.equal(await runner.cancel("user"), true);
  const result = await resultPromise;
  assert.equal(result.stopReason, "user");
  assert.equal(runner.running, false);
  assert.equal(processExists(descendantPid), false);
});

test("timeout escalates TERM to KILL and bounds captured output", async () => {
  const runner = new ShellRunner({
    timeoutMs: 60,
    termGraceMs: 40,
    maxOutputBytes: 32,
  });
  const result = await runner.run(
    "trap '' TERM; printf '%0100d' 0; while :; do sleep 1; done",
    process.cwd(),
  );
  assert.equal(result.stopReason, "timeout");
  assert.equal(result.outputTruncated, true);
  assert.ok(result.stdout.length <= 32);
  assert.equal(runner.running, false);
});

test("shutdown awaits process-tree teardown", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "dsh-shell-shutdown-"));
  const pidFile = join(cwd, "child.pid");
  const runner = new ShellRunner({ timeoutMs: 5_000, termGraceMs: 50 });
  const resultPromise = runner.run(
    `sleep 30 & echo $! > ${JSON.stringify(pidFile)}; wait`,
    cwd,
  );
  const descendantPid = await waitForPid(pidFile);
  await runner.shutdown();
  assert.equal((await resultPromise).stopReason, "shutdown");
  assert.equal(processExists(descendantPid), false);
});
