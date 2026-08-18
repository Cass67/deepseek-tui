/** Owned one-shot shell process groups outside the model-visible session. */

import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_TERM_GRACE_MS = 1_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

export type ShellStopReason = "user" | "timeout" | "shutdown";

export interface ShellResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stopReason?: ShellStopReason;
  outputTruncated: boolean;
}

export interface ShellRunnerOptions {
  timeoutMs?: number;
  termGraceMs?: number;
  maxOutputBytes?: number;
}

interface ActiveShell {
  child: ChildProcessByStdio<null, Readable, Readable>;
  command: string;
  stdout: BoundedOutput;
  stderr: BoundedOutput;
  result: Promise<ShellResult>;
  resolve: (result: ShellResult) => void;
  timeout: ReturnType<typeof setTimeout>;
  stopReason?: ShellStopReason;
  cleanup?: Promise<void>;
  settled: boolean;
}

class BoundedOutput {
  private chunks: Buffer[] = [];
  private bytes = 0;
  truncated = false;

  constructor(private readonly limit: number) {}

  append(chunk: Buffer): void {
    const remaining = this.limit - this.bytes;
    if (remaining <= 0) {
      this.truncated = true;
      return;
    }
    const accepted =
      chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
    this.chunks.push(accepted);
    this.bytes += accepted.byteLength;
    if (accepted.byteLength < chunk.byteLength) this.truncated = true;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function terminateGroup(pid: number, graceMs: number): Promise<void> {
  if (!signalGroup(pid, "SIGTERM")) return;
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  signalGroup(pid, "SIGKILL");
}

/** Own at most one detached shell process group and its teardown. */
export class ShellRunner {
  private active?: ActiveShell;
  private readonly timeoutMs: number;
  private readonly termGraceMs: number;
  private readonly maxOutputBytes: number;

  constructor(options: ShellRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.termGraceMs = options.termGraceMs ?? DEFAULT_TERM_GRACE_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  }

  get running(): boolean {
    return this.active !== undefined;
  }

  /** Start a shell command as a new process-group leader. */
  run(command: string, cwd: string): Promise<ShellResult> {
    if (this.active) throw new Error("A shell command is already running");

    const child = spawn("/bin/sh", ["-lc", command], {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = new BoundedOutput(this.maxOutputBytes);
    const stderr = new BoundedOutput(this.maxOutputBytes);
    let resolveResult: (result: ShellResult) => void = () => undefined;
    const result = new Promise<ShellResult>((resolve) => {
      resolveResult = resolve;
    });
    const active: ActiveShell = {
      child,
      command,
      stdout,
      stderr,
      result,
      resolve: resolveResult,
      timeout: setTimeout(() => {
        void this.stop(active, "timeout");
      }, this.timeoutMs),
      settled: false,
    };
    this.active = active;

    child.stdout.on("data", (chunk: Buffer) => stdout.append(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.append(chunk));
    child.once("error", (error) => {
      stderr.append(Buffer.from(error.message));
      this.finish(active, null, null);
    });
    child.once("exit", () => {
      void this.cleanup(active);
    });
    child.once("close", (code, signal) => {
      void this.cleanup(active).then(() => this.finish(active, code, signal));
    });

    return result;
  }

  /** Stop active shell and descendants; resolves after TERM→KILL cleanup. */
  async cancel(reason: ShellStopReason = "user"): Promise<boolean> {
    const active = this.active;
    if (!active) return false;
    await this.stop(active, reason);
    await active.result;
    return true;
  }

  /** Quiesce active shell for application shutdown. */
  async shutdown(): Promise<void> {
    await this.cancel("shutdown");
  }

  private async stop(
    active: ActiveShell,
    reason: ShellStopReason,
  ): Promise<void> {
    active.stopReason ??= reason;
    await this.cleanup(active);
  }

  private cleanup(active: ActiveShell): Promise<void> {
    const pid = active.child.pid;
    if (!pid) return Promise.resolve();
    active.cleanup ??= terminateGroup(pid, this.termGraceMs);
    return active.cleanup;
  }

  private finish(
    active: ActiveShell,
    exitCode: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    if (active.settled) return;
    active.settled = true;
    clearTimeout(active.timeout);
    if (this.active === active) this.active = undefined;
    active.resolve({
      command: active.command,
      stdout: active.stdout.text(),
      stderr: active.stderr.text(),
      exitCode,
      signal,
      stopReason: active.stopReason,
      outputTruncated: active.stdout.truncated || active.stderr.truncated,
    });
  }
}

/** Format command, bounded output, and exit information for a local status entry. */
export function formatShellResult(result: ShellResult): string {
  const parts = [`$ ${result.command}`];
  if (result.stdout) parts.push(result.stdout.trimEnd());
  if (result.stderr) parts.push(result.stderr.trimEnd());
  if (result.outputTruncated) parts.push("shell output truncated");
  if (result.stopReason === "timeout") parts.push("shell timed out after 120s");
  else if (result.stopReason === "user") parts.push("shell cancelled");
  else if (result.stopReason === "shutdown")
    parts.push("shell stopped for shutdown");
  else if (result.exitCode !== 0)
    parts.push(
      `shell exited with ${result.exitCode ?? result.signal ?? "an error"}`,
    );
  return parts.join("\n");
}
