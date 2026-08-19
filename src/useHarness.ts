/**
 * React hook wrapping the DeepSeek Harness SDK client.
 * Manages subprocess lifecycle, event streaming, and message state.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { useCallback, useEffect, useRef, useState } from "react";
import { HarnessClient } from "@deepseek-ai/dsh-sdk-client";
import type {
  AgentPresetsListResult,
  CommandExecuteResult,
  CommandListResult,
  ImageAttachmentRef,
  HarnessNotification,
  InteractionRequestedNotification,
  ModelCatalogResult,
  ProviderAuthInfoResult,
  NotificationSubscription,
  SessionHistoryEvent,
  SessionListEntry,
  SettingsGetResult,
  SettingsSetParams,
  SettingsSetResult,
  SkillsListResult,
} from "@deepseek-ai/dsh-sdk-client";
import { prepareImageFile, promptContent } from "./attachments.ts";
import {
  applyInteractionReceipt,
  enqueueInteraction,
  interactionRequest,
  resolveInteraction,
  type QuestionAnswer,
} from "./interactions.ts";
import { OperationLock } from "./operationLock.ts";
import { PromptQueue, type QueuedPrompt } from "./promptQueue.ts";
import {
  catalogRoute,
  sessionPickerDescription,
  sessionPresentation,
} from "./sessions.ts";
import type {
  AgentStatus,
  AppState,
  ChatMessage,
  DeliverableEntry,
  FeedbackEntry,
  GoalInfo,
  JobInfo,
  SubagentInfo,
  TodoItem,
  TrajectoryEntry,
  WorkflowMember,
  WorkflowRun,
} from "./types.ts";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS_BIN =
  process.env.DSH_HARNESS_BIN ??
  resolve(
    APP_ROOT,
    "node_modules/@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/bin.js",
  );

const CORDIS_CONFIG =
  process.env.DSH_CORDIS_CONFIG ?? resolve(APP_ROOT, "cordis.yml");

const FLUSH_INTERVAL_MS = 50;
/** Maximum number of trajectory (event log) entries retained. */
const TRAJECTORY_LIMIT = 500;

/** Collapse whitespace and cap length for a one-line trajectory summary. */
function truncateSummary(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Produce a one-line, human-readable summary of a session event for the
 * trajectory log. Returns null for events that should not be logged (e.g.
 * per-token model deltas).
 */
export function trajectorySummary(
  event: Record<string, unknown>,
  toolCallNames: Map<string, string>,
): string | null {
  const type = event.type as string;
  const data = event.data as Record<string, unknown> | undefined;
  if (!data) return null;
  switch (type) {
    case "user/message": {
      const source = data.source as Record<string, unknown> | undefined;
      if (source?.kind !== "user") return null;
      const text = extractText(data.content);
      return text ? `user: ${truncateSummary(text)}` : null;
    }
    case "assistant/message": {
      const message = data.message as Record<string, unknown> | undefined;
      const text = extractText(message?.content);
      return text ? `assistant: ${truncateSummary(text)}` : null;
    }
    case "tool/call": {
      const name = data.name as string;
      const args = data.arguments as string | undefined;
      return `→ ${name}${args ? ` ${truncateSummary(args, 80)}` : ""}`;
    }
    case "tool/result": {
      const message = data.message as Record<string, unknown> | undefined;
      const result = toolResultBlock(message?.content);
      const text = extractText(result?.content);
      const callId = (message?.source as Record<string, unknown> | undefined)
        ?.callId as string | undefined;
      const name = callId ? toolCallNames.get(callId) : undefined;
      const isError = result?.isError === true;
      return `← ${name ?? "tool"}${isError ? " (error)" : ""}: ${truncateSummary(text ?? "", 80)}`;
    }
    case "turn/start":
      return `— turn ${String(data.turn ?? "")} start —`;
    case "turn/end":
      return `— turn ${String(data.turn ?? "")} end —`;
    case "step/start":
      return `  step ${String(data.step ?? "")}`;
    case "plan/mode":
      return `plan mode: ${data.active === true ? "on" : "off"}`;
    case "command/run":
      return `/${String(data.name ?? "command")}`;
    case "command/done": {
      const failed = data.ok === false;
      return `/${String(data.name ?? "command")} ${failed ? "failed" : "done"}`;
    }
    case "approval/asked":
      return `approval asked: ${truncateSummary(String(data.title ?? data.kind ?? ""), 80)}`;
    case "approval/decided":
      return `approval ${String(data.decision ?? "decided")}`;
    case "compaction/summary":
      return `compacted: ${truncateSummary(extractText(data.content) ?? "", 80)}`;
    case "compaction/prune":
      return `pruned ${String(data.prunedCount ?? "?")} tool result(s)`;
    case "llm/retry-started":
      return `llm retry ${String(data.attempt ?? "")}: ${truncateSummary(String(data.reason ?? ""), 60)}`;
    case "session/title":
      return `session titled: ${truncateSummary(String(data.title ?? ""), 60)}`;
    case "sandbox/mode":
      return `sandbox: ${String(data.mode ?? "?")}`;
    case "permission/preset":
      return `permission preset: ${String(data.preset ?? data.name ?? "?")}`;
    case "schedule/change":
      return `schedule ${String(data.action ?? "changed")}: ${truncateSummary(String(data.id ?? ""), 40)}`;
    case "hook/invoked":
      return `hook ${String(data.point ?? "")} invoked`;
    case "hook/result": {
      const blocked = data.blocked === true;
      return `hook ${String(data.point ?? "")} ${blocked ? "blocked" : "ok"}`;
    }
    default:
      return null;
  }
}

/**
 * Session event types this UI deliberately does not surface in the trajectory.
 *
 * `events.test.ts` asserts this set plus the `trajectorySummary` switch covers
 * every member of the harness's `KNOWN_SESSION_EVENT_TYPES`, so a harness
 * upgrade that adds a type fails the suite instead of silently going unnoticed.
 */
export const UNSURFACED_EVENT_TYPES: ReadonlySet<string> = new Set([
  // Per-token/lifecycle noise already reflected elsewhere in the UI.
  "assistant/chunk",
  "session/end-seed",
  "step/end",
  "compaction/start",
  "compaction/end",
  // Internal LLM plumbing, not user-facing.
  "llm/retry",
  "request/context",
  "request/header",
  "session/title-llm-request",
  "web/deepseek-search-llm-request",
  "agent/inbox/spliced",
  "agent-preset/selected",
  "subagent/descriptor",
  "approval/policy",
  // Code-mode sub-call plumbing: each pair is already visible as the tool
  // call it dispatches, so logging both would double every entry.
  "tool/code-dispatch",
  "tool/code-dispatch-start",
]);

/** Describe current model/agent work from durable lifecycle events. */
export function activityForEvent(
  event: Record<string, unknown>,
  current: string | null,
): string | null {
  const type = event.type;
  const data = event.data as Record<string, unknown> | undefined;
  switch (type) {
    case "turn/start":
      return "starting turn";
    case "step/start":
      return current === "resuming after compaction"
        ? "waiting for model"
        : current;
    case "compaction/start":
      return "compacting context";
    case "compaction/end":
      return "resuming after compaction";
    case "tool/call":
      return `running ${String(data?.name ?? "tool")}`;
    case "tool/result":
      return "waiting for model";
    case "turn/end":
      return null;
    case "assistant/chunk": {
      const chunk = data?.chunk as Record<string, unknown> | undefined;
      if (
        chunk?.type === "reasoning-delta" ||
        (chunk?.type === "block-start" && chunk.blockType === "reasoning")
      ) {
        return "thinking";
      }
      if (chunk?.type === "text-delta") return "responding";
      if (typeof chunk?.type === "string" && chunk.type.startsWith("tool-call"))
        return "preparing tool";
      return current;
    }
    default:
      return current;
  }
}

function qwenTokenPlanKey(): string | undefined {
  if (process.env.QWEN_TOKEN_PLAN_API_KEY)
    return process.env.QWEN_TOKEN_PLAN_API_KEY;

  try {
    const key = execFileSync(
      "pi",
      [
        "auth",
        "print-api-key",
        "--provider",
        "qwen-token-plan",
        "--model",
        "qwen3.8-max",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return key || undefined;
  } catch {
    return undefined;
  }
}

async function rollbackResumedSession(
  client: HarnessClient,
  sessionId: string,
  failure: unknown,
): Promise<never> {
  try {
    const closed = await client.closeSession(sessionId);
    if (!closed)
      throw new Error(
        `Resumed session ${sessionId} was not live during rollback`,
      );
  } catch (rollbackFailure) {
    // Both failures are preserved in the AggregateError's errors array.
    // eslint-disable-next-line preserve-caught-error
    throw new AggregateError(
      [failure, rollbackFailure],
      `Unable to roll back resumed session ${sessionId}`,
    );
  }
  throw failure;
}

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

export interface UseHarnessOptions {
  provider?: string;
  model?: string;
  cwd?: string;
  maxTokens?: number;
}

export interface SessionChoice {
  id: string;
  title: string;
  description: string;
  live: boolean;
  persisted: boolean;
}

export interface UseHarnessReturn {
  state: AppState;
  sendMessage: (text: string) => Promise<void>;
  catalog: () => Promise<ModelCatalogResult>;
  selectModel: (
    provider: string,
    model: string,
    reasoningEffort?: string,
  ) => Promise<void>;
  selectReasoning: (reasoningEffort: string) => Promise<void>;
  newSession: () => Promise<void>;
  listSessions: () => Promise<SessionChoice[]>;
  resumeSession: (choice: SessionChoice) => Promise<void>;
  addAttachment: (
    path: string,
    allowOutsideWorkspace?: boolean,
  ) => Promise<void>;
  clearAttachments: () => void;
  respondApproval: (
    requestId: string,
    outcome: "allowed-once" | "rejected",
  ) => Promise<void>;
  respondQuestion: (requestId: string, answer: QuestionAnswer) => Promise<void>;
  cancelQuestion: (requestId: string) => Promise<void>;
  clearView: () => void;
  cancel: () => Promise<boolean>;
  listCommands: () => Promise<CommandListResult>;
  executeCommand: (line: string) => Promise<CommandExecuteResult>;
  listSkills: () => Promise<SkillsListResult>;
  listAgentPresets: () => Promise<AgentPresetsListResult>;
  getSettings: () => Promise<SettingsGetResult>;
  setSettings: (params: SettingsSetParams) => Promise<SettingsSetResult>;
  setWorkspaceDirectory: (directory: string) => Promise<void>;
  providerAuthInfo: (provider: string) => Promise<ProviderAuthInfoResult>;
  startProviderAuth: (
    provider: string,
    type: "api_key" | "oauth",
    onNotification: (notification: HarnessNotification) => void,
  ) => Promise<string>;
  respondProviderAuth: (
    flowId: string,
    promptId: string,
    value: string,
  ) => Promise<boolean>;
  cancelProviderAuth: (flowId: string) => Promise<boolean>;
  logoutProvider: (provider: string) => Promise<void>;
  notify: (text: string) => void;
  shutdown: () => Promise<void>;
}

/** Extract text content from a ContentBlock array. */
function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is Record<string, unknown> =>
        typeof b === "object" && b !== null && b.type === "text",
    )
    .map((b) => String(b.text ?? ""))
    .join("");
}

function toolResultBlock(
  content: unknown,
): Record<string, unknown> | undefined {
  if (!Array.isArray(content)) return undefined;
  return content.find(
    (block): block is Record<string, unknown> =>
      typeof block === "object" &&
      block !== null &&
      block.type === "tool-result",
  );
}

function imageAttachments(content: unknown): ImageAttachmentRef[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (typeof block !== "object" || block === null) return [];
    const candidate = block as Record<string, unknown>;
    if (candidate.type !== "image") return [];
    const attachment = candidate.attachment;
    return typeof attachment === "object" && attachment !== null
      ? [attachment as ImageAttachmentRef]
      : [];
  });
}

/**
 * Extract a deliverable (file path or command) from a mutating tool call.
 * Returns null for tools that do not produce a deliverable.
 */
export function deliverableForToolCall(
  toolName: string,
  argumentsJson: string,
): { target: string; action: string } | null {
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(argumentsJson);
    if (typeof parsed !== "object" || parsed === null) return null;
    args = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (toolName) {
    case "write": {
      const path = typeof args.file_path === "string" ? args.file_path : null;
      return path ? { target: path, action: "wrote" } : null;
    }
    case "edit": {
      const path = typeof args.file_path === "string" ? args.file_path : null;
      return path ? { target: path, action: "edited" } : null;
    }
    case "str_replace_editor": {
      const path = typeof args.path === "string" ? args.path : null;
      return path ? { target: path, action: "edited" } : null;
    }
    case "bash": {
      const command = typeof args.command === "string" ? args.command : null;
      return command ? { target: command, action: "ran" } : null;
    }
    default:
      return null;
  }
}

/** Process one session event into the mutable message list. */
export function processEvent(
  event: Record<string, unknown>,
  messages: ChatMessage[],
  ctx: {
    streamingText: string;
    assistantId: string | null;
    usage: { input: number; output: number };
    planModeActive: boolean;
    subagents: SubagentInfo[];
    jobs: JobInfo[];
    goal: GoalInfo | null;
    workflowRuns: WorkflowRun[];
    feedback: FeedbackEntry[];
    deliverables: DeliverableEntry[];
    toolCallNames: Map<string, string>;
  },
): {
  streamingText: string;
  assistantId: string | null;
  planModeActive: boolean;
} {
  const type = event.type as string;
  const data = event.data as Record<string, unknown> | undefined;
  if (!data)
    return {
      streamingText: ctx.streamingText,
      assistantId: ctx.assistantId,
      planModeActive: ctx.planModeActive,
    };

  switch (type) {
    case "user/message": {
      const source = data.source as Record<string, unknown> | undefined;
      if (source?.kind !== "user") break;
      const text = extractText(data.content);
      const attachments = imageAttachments(data.content);
      if (text || attachments.length > 0) {
        messages.push({
          id: nextId(),
          role: "user",
          content: text,
          ...(attachments.length > 0 ? { attachments } : {}),
          timestamp: Date.now(),
        });
      }
      break;
    }

    case "assistant/chunk": {
      const chunk = data.chunk as Record<string, unknown> | undefined;
      const text =
        chunk?.type === "text-delta"
          ? (chunk.text as string | undefined)
          : undefined;
      if (text) {
        let assistantId = ctx.assistantId;
        if (!assistantId) {
          assistantId = nextId();
          messages.push({
            id: assistantId,
            role: "assistant",
            content: "",
            turn: data.turn as number,
            step: data.step as number,
            timestamp: Date.now(),
          });
        }
        return {
          streamingText: ctx.streamingText + text,
          assistantId,
          planModeActive: ctx.planModeActive,
        };
      }
      break;
    }

    case "assistant/message": {
      const message = data.message as Record<string, unknown> | undefined;
      const assembled = extractText(message?.content);
      let msg = ctx.assistantId
        ? messages.find((candidate) => candidate.id === ctx.assistantId)
        : undefined;
      if (!msg && assembled) {
        msg = {
          id: nextId(),
          role: "assistant",
          content: "",
          timestamp: Date.now(),
        };
        messages.push(msg);
      }
      if (msg) {
        msg.content = assembled || ctx.streamingText;
        const usage = data.usage as Record<string, unknown> | undefined;
        if (usage) {
          msg.usage = {
            inputTokens: usage.inputTokens as number | undefined,
            outputTokens: usage.outputTokens as number | undefined,
          };
          ctx.usage.input += msg.usage.inputTokens ?? 0;
          ctx.usage.output += msg.usage.outputTokens ?? 0;
        }
      }
      return {
        streamingText: "",
        assistantId: null,
        planModeActive: ctx.planModeActive,
      };
    }

    case "tool/call": {
      const toolName = data.name as string;
      const callId = data.callId as string;
      messages.push({
        id: nextId(),
        role: "tool_call",
        content: "",
        toolName,
        toolArgs: data.arguments as string,
        toolCallId: callId,
        turn: data.turn as number,
        step: data.step as number,
        timestamp: Date.now(),
      });
      if (callId) ctx.toolCallNames.set(callId, toolName);
      // Track subagent delegations for the subagents panel.
      if (toolName === "subagent" || toolName === "subagent_fork") {
        let description: string;
        try {
          const args = JSON.parse(data.arguments as string);
          description = String(args.description ?? "");
        } catch {
          description = "";
        }
        ctx.subagents.push({
          id: callId,
          description,
          status: "running",
        });
      }
      // Track mutating tool calls (write/edit/bash) for the deliverables panel.
      const deliverable = deliverableForToolCall(
        toolName,
        data.arguments as string,
      );
      if (deliverable) {
        ctx.deliverables.push({
          id: nextId(),
          timestamp: Date.now(),
          toolName,
          target: deliverable.target,
          action: deliverable.action,
        });
      }
      break;
    }

    case "tool/result": {
      const message = data.message as Record<string, unknown> | undefined;
      const result = toolResultBlock(message?.content);
      const text = extractText(result?.content);
      const callId = (message?.source as Record<string, unknown> | undefined)
        ?.callId as string | undefined;
      messages.push({
        id: nextId(),
        role: "tool_result",
        content: text,
        toolCallId: callId,
        toolError: result?.isError === true,
        timestamp: Date.now(),
      });
      const toolName = callId ? ctx.toolCallNames.get(callId) : undefined;
      // Mark the subagent as done when its tool result arrives.
      if (callId && (toolName === "subagent" || toolName === "subagent_fork")) {
        const subagent = ctx.subagents.find((s) => s.id === callId);
        if (subagent) subagent.status = "done";
      }
      // Refresh the jobs panel from a job_list result (mutate in place so the
      // caller's reference stays valid).
      if (toolName === "job_list" && text) {
        ctx.jobs.splice(0, ctx.jobs.length, ...parseJobList(text));
      }
      break;
    }

    case "turn/end": {
      if (ctx.assistantId) {
        const partial = messages.find(
          (message) => message.id === ctx.assistantId,
        );
        if (partial) partial.content = ctx.streamingText;
      }
      const reason = data.reason as Record<string, unknown> | undefined;
      if (reason?.kind === "aborted") {
        messages.push({
          id: nextId(),
          role: "status",
          content: "Turn cancelled",
          timestamp: Date.now(),
        });
      } else if (reason?.kind === "error") {
        const failure = reason.error as Record<string, unknown> | undefined;
        messages.push({
          id: nextId(),
          role: "status",
          content: `Turn failed: ${String(failure?.message ?? "unknown error")}`,
          timestamp: Date.now(),
        });
      }
      return {
        streamingText: "",
        assistantId: null,
        planModeActive: ctx.planModeActive,
      };
    }

    case "todo/write": {
      const rawTodos = data.todos as Array<Record<string, unknown>> | undefined;
      if (rawTodos?.length) {
        const todos: TodoItem[] = rawTodos.map((t) => ({
          content: String(t.content ?? ""),
          status: normalizeTodoStatus(t.status),
        }));
        // Update the existing todo message in place so the list reflects the
        // latest snapshot without stacking a new message on every write.
        const existing = findLastTodoMessage(messages);
        if (existing) {
          existing.todos = todos;
          existing.content = renderTodos(todos);
          existing.timestamp = Date.now();
        } else {
          messages.push({
            id: nextId(),
            role: "todo",
            content: renderTodos(todos),
            todos,
            timestamp: Date.now(),
          });
        }
      }
      break;
    }

    case "plan/mode": {
      ctx.planModeActive = data.active === true;
      break;
    }
    case "goal/change": {
      const operation = data.operation as string | undefined;
      if (operation === "clear") {
        ctx.goal = null;
        break;
      }
      const goal = data.goal as Record<string, unknown> | undefined;
      if (
        goal &&
        typeof goal.id === "string" &&
        typeof goal.objective === "string"
      ) {
        ctx.goal = {
          id: goal.id,
          objective: goal.objective,
          phase: (goal.phase as GoalInfo["phase"]) ?? "active",
          maxGoalRounds:
            typeof goal.maxGoalRounds === "number" ? goal.maxGoalRounds : 0,
          roundsStarted:
            typeof data.roundsStarted === "number" ? data.roundsStarted : 0,
        };
      }
      break;
    }
    case "tool-workflow/run-start": {
      const runId = data.runId as string | undefined;
      const name = data.name as string | undefined;
      if (runId && name) {
        ctx.workflowRuns.push({ runId, name, ended: false, members: [] });
      }
      break;
    }
    case "tool-workflow/agent-start": {
      const runId = data.runId as string | undefined;
      const run = ctx.workflowRuns.find((r) => r.runId === runId);
      if (run) {
        run.members.push({
          seq: typeof data.seq === "number" ? data.seq : 0,
          label: typeof data.label === "string" ? data.label : "",
          phase: typeof data.phase === "string" ? data.phase : undefined,
        });
      }
      break;
    }
    case "tool-workflow/agent-end": {
      const runId = data.runId as string | undefined;
      const run = ctx.workflowRuns.find((r) => r.runId === runId);
      if (run) {
        const member = run.members.find(
          (m) => m.seq === data.seq && m.outcome === undefined,
        );
        if (member) {
          member.outcome =
            (data.outcome as WorkflowMember["outcome"]) ?? "completed";
        }
      }
      break;
    }
    case "tool-workflow/run-end": {
      const runId = data.runId as string | undefined;
      const run = ctx.workflowRuns.find((r) => r.runId === runId);
      if (run) run.ended = true;
      break;
    }
    case "feedback/record": {
      const text = data.text as string | undefined;
      if (text) {
        ctx.feedback.push({ text, timestamp: Date.now() });
      }
      break;
    }
  }

  return {
    streamingText: ctx.streamingText,
    assistantId: ctx.assistantId,
    planModeActive: ctx.planModeActive,
  };
}

function normalizeTodoStatus(status: unknown): TodoItem["status"] {
  if (status === "completed" || status === "in_progress") return status;
  return "pending";
}

/** Parse the rendered `job_list` text (`id [kind] status — label` per line). */
function parseJobList(text: string): JobInfo[] {
  const jobs: JobInfo[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^(\S+) \[(\S+)\] (\S+) — (.+)$/);
    if (match) {
      const status = match[3];
      if (
        status === "running" ||
        status === "stopping" ||
        status === "completed" ||
        status === "killed" ||
        status === "failed"
      ) {
        jobs.push({
          id: match[1],
          kind: match[2],
          status,
          label: match[4],
        });
      }
    }
  }
  return jobs;
}

function renderTodos(todos: readonly TodoItem[]): string {
  return todos
    .map((t) => {
      const marker =
        t.status === "completed" ? "✓" : t.status === "in_progress" ? "→" : "○";
      return `${marker} ${t.content}`;
    })
    .join("\n");
}

function findLastTodoMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "todo") return messages[index];
  }
  return undefined;
}

/** Rebuild visible transcript and token totals from one exact durable event log. */
export function replayHistory(events: readonly SessionHistoryEvent[]): {
  messages: ChatMessage[];
  usage: { input: number; output: number };
  planModeActive: boolean;
  subagents: SubagentInfo[];
  jobs: JobInfo[];
  goal: GoalInfo | null;
  workflowRuns: WorkflowRun[];
  feedback: FeedbackEntry[];
  deliverables: DeliverableEntry[];
} {
  const messages: ChatMessage[] = [];
  const usage = { input: 0, output: 0 };
  const subagents: SubagentInfo[] = [];
  const jobs: JobInfo[] = [];
  const workflowRuns: WorkflowRun[] = [];
  const feedback: FeedbackEntry[] = [];
  const deliverables: DeliverableEntry[] = [];
  const toolCallNames = new Map<string, string>();
  const ctx = {
    streamingText: "",
    assistantId: null as string | null,
    usage,
    planModeActive: false,
    subagents,
    jobs,
    goal: null as GoalInfo | null,
    workflowRuns,
    feedback,
    deliverables,
    toolCallNames,
  };
  for (const event of events) {
    const result = processEvent(
      event as unknown as Record<string, unknown>,
      messages,
      ctx,
    );
    ctx.streamingText = result.streamingText;
    ctx.assistantId = result.assistantId;
    ctx.planModeActive = result.planModeActive;
  }
  return {
    messages,
    usage,
    planModeActive: ctx.planModeActive,
    subagents,
    jobs,
    goal: ctx.goal,
    workflowRuns,
    feedback,
    deliverables,
  };
}

export function useHarness(options: UseHarnessOptions = {}): UseHarnessReturn {
  const initialProvider =
    options.provider ?? process.env.DSH_PROVIDER ?? "qwen-token-plan";
  const initialModel =
    options.model ?? process.env.DSH_MODEL ?? "qwen3.8-max-preview";
  const cwd = options.cwd ?? process.env.DSH_CWD ?? process.cwd();
  const maxTokens =
    options.maxTokens ?? (Number(process.env.DSH_MAX_TOKENS) || 16_384);
  const initialSessionId = useRef(`tui-session-${randomUUID()}`).current;

  const [state, setState] = useState<AppState>({
    messages: [],
    status: "connecting",
    activity: "starting runtime",
    activitySince: Date.now(),
    sessionId: initialSessionId,
    workspaceDirectory: cwd,
    model: initialModel,
    provider: initialProvider,
    tokenUsage: { input: 0, output: 0 },
    currentStreamingText: "",
    pendingAttachments: [],
    queuedPromptCount: 0,
    pendingInteractions: [],
    planModeActive: false,
    subagents: [],
    jobs: [],
    goal: null,
    workflowRuns: [],
    feedback: [],
    trajectory: [],
    deliverables: [],
  });

  const clientRef = useRef<HarnessClient | null>(null);
  const subscriptionRef = useRef<NotificationSubscription | null>(null);
  const interactionSubscriptionRef = useRef<NotificationSubscription | null>(
    null,
  );
  const authSubscriptionsRef = useRef(new Set<NotificationSubscription>());
  const subscriptionGenerationRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const streamingRef = useRef("");
  const assistantIdRef = useRef<string | null>(null);
  const statusRef = useRef<AgentStatus>("connecting");
  const activityRef = useRef<string | null>("starting runtime");
  const activitySinceRef = useRef<number | null>(Date.now());
  const usageRef = useRef({ input: 0, output: 0 });
  const planModeRef = useRef(false);
  const subagentsRef = useRef<SubagentInfo[]>([]);
  const jobsRef = useRef<JobInfo[]>([]);
  const goalRef = useRef<GoalInfo | null>(null);
  const workflowRunsRef = useRef<WorkflowRun[]>([]);
  const feedbackRef = useRef<FeedbackEntry[]>([]);
  const trajectoryRef = useRef<TrajectoryEntry[]>([]);
  const trajectoryIdRef = useRef(0);
  const deliverablesRef = useRef<DeliverableEntry[]>([]);
  const toolCallNamesRef = useRef(new Map<string, string>());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(initialSessionId);
  const workspaceDirectoryRef = useRef(cwd);
  const routeRef = useRef<{
    provider: string;
    model: string;
    reasoningEffort?: string;
  }>({
    provider: initialProvider,
    model: initialModel,
  });
  const pendingAttachmentsRef = useRef<ImageAttachmentRef[]>([]);
  const queuedPromptsRef = useRef(new PromptQueue());
  const promptOperationRef = useRef(false);
  const drainQueuedPromptRef = useRef<() => void>(() => {});
  const pendingToolCallsRef = useRef(new Set<string>());
  const pendingInteractionsRef = useRef<InteractionRequestedNotification[]>([]);
  const operationLockRef = useRef(
    new OperationLock(() => {
      queueMicrotask(() => drainQueuedPromptRef.current());
    }),
  );
  const shutdownTaskRef = useRef<Promise<void> | null>(null);

  const flushState = useCallback(() => {
    setState((prev) => ({
      ...prev,
      messages: [...messagesRef.current],
      currentStreamingText: streamingRef.current,
      workspaceDirectory: workspaceDirectoryRef.current,
      status: statusRef.current,
      activity: activityRef.current,
      activitySince: activitySinceRef.current,
      tokenUsage: { ...usageRef.current },
      pendingAttachments: [...pendingAttachmentsRef.current],
      queuedPromptCount: queuedPromptsRef.current.length,
      pendingInteractions: [...pendingInteractionsRef.current],
      planModeActive: planModeRef.current,
      subagents: [...subagentsRef.current],
      jobs: [...jobsRef.current],
      goal: goalRef.current,
      workflowRuns: workflowRunsRef.current.map((run) => ({
        ...run,
        members: [...run.members],
      })),
      feedback: [...feedbackRef.current],
      trajectory: [...trajectoryRef.current],
      deliverables: [...deliverablesRef.current],
    }));
  }, []);

  const setActivity = useCallback((activity: string | null) => {
    if (activityRef.current === activity) return;
    activityRef.current = activity;
    activitySinceRef.current = activity === null ? null : Date.now();
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushState();
    }, FLUSH_INTERVAL_MS);
  }, [flushState]);

  const notify = useCallback(
    (text: string) => {
      messagesRef.current.push({
        id: nextId(),
        role: "status",
        content: text,
        timestamp: Date.now(),
      });
      flushState();
    },
    [flushState],
  );

  const stopSubscription = useCallback(() => {
    subscriptionGenerationRef.current += 1;
    subscriptionRef.current?.close();
    subscriptionRef.current = null;
  }, []);

  const startSubscription = useCallback(
    (sessionId: string) => {
      const client = clientRef.current;
      if (!client) return;
      stopSubscription();
      const generation = subscriptionGenerationRef.current;
      const subscription = client.subscribeSessionTree(sessionId);
      subscriptionRef.current = subscription;

      void (async () => {
        try {
          for await (const notification of subscription) {
            if (generation !== subscriptionGenerationRef.current) return;
            if (notification.method === "session.event") {
              const params = notification.params as unknown as Record<
                string,
                unknown
              >;
              if (params.sessionId !== sessionId) continue;
              const event = params.event as Record<string, unknown>;
              const eventData = event.data as
                | Record<string, unknown>
                | undefined;
              if (
                event.type === "tool/call" &&
                typeof eventData?.callId === "string"
              ) {
                pendingToolCallsRef.current.add(eventData.callId);
              } else if (event.type === "tool/result") {
                const message = eventData?.message as
                  | Record<string, unknown>
                  | undefined;
                const source = message?.source as
                  | Record<string, unknown>
                  | undefined;
                if (typeof source?.callId === "string")
                  pendingToolCallsRef.current.delete(source.callId);
              } else if (event.type === "turn/end") {
                pendingToolCallsRef.current.clear();
              }
              const nextActivity = activityForEvent(event, activityRef.current);
              setActivity(
                event.type === "tool/result" &&
                  pendingToolCallsRef.current.size > 0
                  ? `running ${pendingToolCallsRef.current.size} tool${pendingToolCallsRef.current.size === 1 ? "" : "s"}`
                  : nextActivity,
              );
              const result = processEvent(event, messagesRef.current, {
                streamingText: streamingRef.current,
                assistantId: assistantIdRef.current,
                usage: usageRef.current,
                planModeActive: planModeRef.current,
                subagents: subagentsRef.current,
                jobs: jobsRef.current,
                goal: goalRef.current,
                workflowRuns: workflowRunsRef.current,
                feedback: feedbackRef.current,
                deliverables: deliverablesRef.current,
                toolCallNames: toolCallNamesRef.current,
              });
              streamingRef.current = result.streamingText;
              assistantIdRef.current = result.assistantId;
              planModeRef.current = result.planModeActive;
              const summary = trajectorySummary(
                event,
                toolCallNamesRef.current,
              );
              if (summary !== null) {
                const buffer = trajectoryRef.current;
                buffer.push({
                  id: ++trajectoryIdRef.current,
                  timestamp: Date.now(),
                  summary,
                });
                if (buffer.length > TRAJECTORY_LIMIT) {
                  buffer.splice(0, buffer.length - TRAJECTORY_LIMIT);
                }
              }
              scheduleFlush();
            } else if (notification.method === "session.status") {
              const params = notification.params as unknown as Record<
                string,
                unknown
              >;
              if (params.sessionId !== sessionId) continue;
              statusRef.current = params.status as AgentStatus;
              if (statusRef.current === "idle") {
                setActivity(null);
                queueMicrotask(() => drainQueuedPromptRef.current());
              } else if (
                statusRef.current === "running" &&
                activityRef.current === null
              )
                setActivity("working");
              flushState();
            }
          }
        } catch (error) {
          if (
            generation !== subscriptionGenerationRef.current ||
            shutdownTaskRef.current
          )
            return;
          statusRef.current = "error";
          setActivity(null);
          notify(
            `Runtime connection lost: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      })();
    },
    [flushState, notify, scheduleFlush, setActivity, stopSubscription],
  );

  const startInteractionSubscription = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    interactionSubscriptionRef.current?.close();
    const subscription = client.subscribe(
      (notification) =>
        notification.method === "interaction.requested" ||
        notification.method === "interaction.resolved",
    );
    interactionSubscriptionRef.current = subscription;
    void (async () => {
      try {
        for await (const notification of subscription) {
          if (notification.method === "interaction.requested") {
            const request = interactionRequest(notification.params);
            if (!request)
              throw new Error("Runtime sent malformed interaction request");
            pendingInteractionsRef.current = enqueueInteraction(
              pendingInteractionsRef.current,
              request,
            );
          } else if (notification.method === "interaction.resolved") {
            const requestId = (notification.params as Record<string, unknown>)
              .requestId;
            if (typeof requestId !== "string")
              throw new Error("Runtime sent malformed interaction resolution");
            pendingInteractionsRef.current = resolveInteraction(
              pendingInteractionsRef.current,
              requestId,
            );
          }
          flushState();
        }
      } catch (error) {
        if (shutdownTaskRef.current) return;
        statusRef.current = "error";
        setActivity(null);
        notify(
          `Interaction channel lost: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    })();
  }, [flushState, notify, setActivity]);

  useEffect(() => {
    const tokenPlanKey = qwenTokenPlanKey();
    const client = new HarnessClient({
      command: "node",
      args: [HARNESS_BIN, CORDIS_CONFIG],
      cwd,
      env: {
        ...process.env,
        DSH_CWD: cwd,
        DSH_SESSION_ROOT: `${cwd}/.sessions`,
        ...(tokenPlanKey ? { QWEN_TOKEN_PLAN_API_KEY: tokenPlanKey } : {}),
      },
    });
    clientRef.current = client;
    let disposed = false;

    const init = async () => {
      try {
        client.start();
        await client.initialize({
          cwd,
          provider: initialProvider,
          model: initialModel,
          maxTokens,
        });
        if (disposed) return;
        startInteractionSubscription();
        startSubscription(sessionIdRef.current);
        statusRef.current = "idle";
        setActivity(null);
        flushState();
      } catch (error) {
        if (disposed) return;
        statusRef.current = "error";
        setActivity(null);
        notify(
          `Harness failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    void init();

    return () => {
      disposed = true;
      stopSubscription();
      interactionSubscriptionRef.current?.close();
      interactionSubscriptionRef.current = null;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      void client.close();
    };
    // Runtime launch settings are immutable for this hook instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requireClient = useCallback((): HarnessClient => {
    const client = clientRef.current;
    if (!client || statusRef.current === "connecting")
      throw new Error("Harness is still connecting");
    if (statusRef.current === "error")
      throw new Error("Harness connection is unavailable");
    return client;
  }, []);

  const runPrompt = useCallback(
    async (prompt: QueuedPrompt): Promise<boolean> => {
      let release: (() => void) | undefined;
      let markedRunning = false;
      try {
        release = operationLockRef.current.acquire("send a prompt");
        promptOperationRef.current = true;
        if (statusRef.current !== "idle")
          throw new Error(
            "Wait for the active turn before sending another prompt",
          );
        const client = requireClient();
        if (prompt.attachments.length > 0) {
          const currentCatalog = await client.catalog();
          const currentModel = currentCatalog.providers
            .find((provider) => provider.id === routeRef.current.provider)
            ?.models.find((model) => model.id === routeRef.current.model);
          if (!currentModel?.inputModalities?.includes("image")) {
            throw new Error(
              `Model ${routeRef.current.provider}/${routeRef.current.model} does not accept image input`,
            );
          }
        }
        streamingRef.current = "";
        assistantIdRef.current = null;
        statusRef.current = "running";
        setActivity("waiting for model");
        markedRunning = true;
        flushState();
        await client.prompt(
          sessionIdRef.current,
          promptContent(prompt.text, prompt.attachments),
        );
        flushState();
        return true;
      } catch (error) {
        if (markedRunning && statusRef.current === "running") {
          statusRef.current = "idle";
          setActivity(null);
        }
        notify(
          `Send failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      } finally {
        promptOperationRef.current = false;
        release?.();
        if (statusRef.current === "idle")
          queueMicrotask(() => drainQueuedPromptRef.current());
      }
    },
    [flushState, notify, requireClient, setActivity],
  );

  const drainQueuedPrompt = useCallback(() => {
    if (
      shutdownTaskRef.current ||
      promptOperationRef.current ||
      operationLockRef.current.isActive ||
      statusRef.current !== "idle"
    )
      return;
    const prompt = queuedPromptsRef.current.begin();
    if (!prompt) return;
    flushState();
    void runPrompt(prompt).finally(() => {
      queuedPromptsRef.current.finish();
      if (statusRef.current === "idle")
        queueMicrotask(() => drainQueuedPromptRef.current());
    });
  }, [flushState, runPrompt]);
  drainQueuedPromptRef.current = drainQueuedPrompt;

  const sendMessage = useCallback(
    async (text: string) => {
      const alreadyBusy =
        statusRef.current === "running" ||
        promptOperationRef.current ||
        operationLockRef.current.isActive;
      const count = queuedPromptsRef.current.enqueue(
        text,
        pendingAttachmentsRef.current,
      );
      pendingAttachmentsRef.current = [];
      if (alreadyBusy) notify(`Queued prompt (${count} waiting).`);
      else {
        flushState();
        drainQueuedPromptRef.current();
      }
    },
    [flushState, notify],
  );

  const catalog = useCallback(() => requireClient().catalog(), [requireClient]);

  const selectModel = useCallback(
    async (provider: string, model: string, reasoningEffort?: string) => {
      const release = operationLockRef.current.acquire("select a model");
      try {
        if (statusRef.current !== "idle")
          throw new Error("Cancel active turn before selecting a model");
        const selected = await requireClient().selectModel(
          sessionIdRef.current,
          provider,
          model,
          reasoningEffort,
        );
        routeRef.current = {
          provider: selected.provider,
          model: selected.model,
          ...(selected.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: selected.reasoningEffort }),
        };
        setState((prev) => ({
          ...prev,
          provider: selected.provider,
          model: selected.model,
          reasoningEffort: selected.reasoningEffort,
        }));
        notify(
          `Model: ${selected.provider}/${selected.model}${selected.reasoningEffort ? ` · reasoning ${selected.reasoningEffort}` : ""}`,
        );
      } finally {
        release();
      }
    },
    [notify, requireClient],
  );

  const selectReasoning = useCallback(
    async (reasoningEffort: string) => {
      const release = operationLockRef.current.acquire(
        "select a reasoning level",
      );
      try {
        if (statusRef.current !== "idle")
          throw new Error("Cancel active turn before selecting reasoning");
        const client = requireClient();
        const route = routeRef.current;
        const catalog = await client.catalog();
        const model = catalog.providers
          .find((provider) => provider.id === route.provider)
          ?.models.find((candidate) => candidate.id === route.model);
        if (
          !model?.reasoning?.efforts.some(
            (effort) => effort.id === reasoningEffort,
          )
        ) {
          throw new Error(
            `Reasoning level ${reasoningEffort} is unavailable for ${route.provider}/${route.model}`,
          );
        }
        const selected = await client.selectModel(
          sessionIdRef.current,
          route.provider,
          route.model,
          reasoningEffort,
        );
        routeRef.current = {
          provider: selected.provider,
          model: selected.model,
          ...(selected.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: selected.reasoningEffort }),
        };
        setState((prev) => ({
          ...prev,
          provider: selected.provider,
          model: selected.model,
          reasoningEffort: selected.reasoningEffort,
        }));
        notify(`Reasoning: ${selected.reasoningEffort ?? "provider default"}`);
      } finally {
        release();
      }
    },
    [notify, requireClient],
  );

  const newSession = useCallback(async () => {
    const release = operationLockRef.current.acquire("start a new session");
    try {
      if (statusRef.current === "running")
        throw new Error("Cancel active turn before starting a new session");
      if (pendingInteractionsRef.current.length > 0)
        throw new Error(
          "Resolve pending interaction before starting a new session",
        );
      const client = requireClient();
      const previousId = sessionIdRef.current;
      const nextId = `tui-session-${randomUUID()}`;
      const selected = await client.selectModel(
        nextId,
        routeRef.current.provider,
        routeRef.current.model,
        routeRef.current.reasoningEffort,
      );

      statusRef.current = "connecting";
      setActivity("starting new session");
      stopSubscription();
      flushState();
      let closeWarning: string | undefined;
      try {
        await client.closeSession(previousId);
      } catch (error) {
        closeWarning = `Previous session teardown failed: ${error instanceof Error ? error.message : String(error)}`;
      }

      routeRef.current = {
        provider: selected.provider,
        model: selected.model,
        ...(selected.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: selected.reasoningEffort }),
      };
      sessionIdRef.current = nextId;
      messagesRef.current = [];
      streamingRef.current = "";
      assistantIdRef.current = null;
      usageRef.current = { input: 0, output: 0 };
      planModeRef.current = false;
      subagentsRef.current = [];
      jobsRef.current = [];
      goalRef.current = null;
      workflowRunsRef.current = [];
      feedbackRef.current = [];
      toolCallNamesRef.current = new Map();
      statusRef.current = "idle";
      setActivity(null);
      setState((prev) => ({
        ...prev,
        sessionId: nextId,
        provider: selected.provider,
        model: selected.model,
        reasoningEffort: selected.reasoningEffort,
        messages: [],
        currentStreamingText: "",
        tokenUsage: { input: 0, output: 0 },
        planModeActive: false,
        subagents: [],
        jobs: [],
        goal: null,
        workflowRuns: [],
        feedback: [],
        status: "idle",
        activity: null,
        activitySince: null,
      }));
      startSubscription(nextId);
      if (closeWarning) notify(closeWarning);
    } finally {
      release();
    }
  }, [
    flushState,
    notify,
    requireClient,
    setActivity,
    startSubscription,
    stopSubscription,
  ]);

  const listSessions = useCallback(async (): Promise<SessionChoice[]> => {
    const release = operationLockRef.current.acquire("list sessions");
    try {
      const client = requireClient();
      const result = await client.listSessions();
      return await Promise.all(
        result.sessions.map(async (entry: SessionListEntry) => {
          let title =
            entry.header.id === sessionIdRef.current
              ? "Current session"
              : "Untitled session";
          if (entry.persisted) {
            try {
              title = sessionPresentation(
                (await client.sessionHistory(entry.header.id)).events,
              ).title;
            } catch {
              // Listing remains useful when one independently mutable log cannot be read.
            }
          }
          return {
            id: entry.header.id,
            title,
            description: sessionPickerDescription(entry),
            live: entry.live,
            persisted: entry.persisted,
          };
        }),
      );
    } finally {
      release();
    }
  }, [requireClient]);

  const resumeSession = useCallback(
    async (choice: SessionChoice) => {
      const release = operationLockRef.current.acquire("resume a session");
      try {
        if (choice.id === sessionIdRef.current) return;
        if (statusRef.current === "running")
          throw new Error("Cancel active turn before switching sessions");
        if (pendingInteractionsRef.current.length > 0)
          throw new Error(
            "Resolve pending interaction before switching sessions",
          );
        if (choice.live)
          throw new Error("Selected session is already live in this runtime");
        if (!choice.persisted)
          throw new Error("Selected session has no durable history to resume");

        const client = requireClient();
        await client.resumeSession(choice.id);
        const [history, currentCatalog] = await Promise.all([
          client.sessionHistory(choice.id),
          client.catalog(),
        ]).catch((error) => rollbackResumedSession(client, choice.id, error));
        const replayed = replayHistory(history.events);
        const presentation = sessionPresentation(history.events);
        const restoredRoute = catalogRoute(presentation, currentCatalog);
        if (!restoredRoute) {
          return await rollbackResumedSession(
            client,
            choice.id,
            new Error(
              `Resumed session route ${presentation.provider ?? "(missing)"}/${presentation.model ?? "(missing)"} is not in the current model catalog`,
            ),
          );
        }

        const previousId = sessionIdRef.current;
        statusRef.current = "connecting";
        setActivity("switching session");
        stopSubscription();
        flushState();
        let closeWarning: string | undefined;
        try {
          await client.closeSession(previousId);
        } catch (error) {
          closeWarning = `Previous session teardown failed: ${error instanceof Error ? error.message : String(error)}`;
        }

        sessionIdRef.current = choice.id;
        routeRef.current = restoredRoute;
        messagesRef.current = replayed.messages;
        usageRef.current = replayed.usage;
        planModeRef.current = replayed.planModeActive;
        subagentsRef.current = replayed.subagents;
        jobsRef.current = replayed.jobs;
        goalRef.current = replayed.goal;
        workflowRunsRef.current = replayed.workflowRuns;
        feedbackRef.current = replayed.feedback;
        deliverablesRef.current = replayed.deliverables;
        toolCallNamesRef.current = new Map();
        streamingRef.current = "";
        assistantIdRef.current = null;
        statusRef.current = "idle";
        setActivity(null);
        setState((previous) => ({
          ...previous,
          sessionId: choice.id,
          ...restoredRoute,
          reasoningEffort: restoredRoute.reasoningEffort,
          messages: [...replayed.messages],
          currentStreamingText: "",
          tokenUsage: { ...replayed.usage },
          planModeActive: replayed.planModeActive,
          subagents: [...replayed.subagents],
          jobs: [...replayed.jobs],
          goal: replayed.goal,
          workflowRuns: replayed.workflowRuns.map((run) => ({
            ...run,
            members: [...run.members],
          })),
          feedback: [...replayed.feedback],
          status: "idle",
          activity: null,
          activitySince: null,
        }));
        startSubscription(choice.id);
        if (closeWarning) notify(closeWarning);
      } finally {
        release();
      }
    },
    [
      flushState,
      notify,
      requireClient,
      setActivity,
      startSubscription,
      stopSubscription,
    ],
  );

  const addAttachment = useCallback(
    async (path: string, allowOutsideWorkspace = false) => {
      const release = operationLockRef.current.acquire("attach an image");
      try {
        if (!path.trim()) throw new Error("Usage: /attach <path>");
        if (statusRef.current !== "idle")
          throw new Error("Wait for the active turn before attaching an image");
        const client = requireClient();
        const [limits, currentCatalog] = await Promise.all([
          client.imageLimits(),
          client.catalog(),
        ]);
        const currentModel = currentCatalog.providers
          .find((provider) => provider.id === routeRef.current.provider)
          ?.models.find((model) => model.id === routeRef.current.model);
        if (!currentModel?.inputModalities?.includes("image")) {
          throw new Error(
            `Model ${routeRef.current.provider}/${routeRef.current.model} does not accept image input`,
          );
        }
        if (
          pendingAttachmentsRef.current.length >= limits.maxImagesPerMessage
        ) {
          throw new Error(`Image count limit is ${limits.maxImagesPerMessage}`);
        }
        const prepared = await prepareImageFile(
          path,
          workspaceDirectoryRef.current,
          limits,
          allowOutsideWorkspace,
        );
        const aggregateBytes = pendingAttachmentsRef.current.reduce(
          (total, attachment) => total + attachment.bytes,
          0,
        );
        if (
          aggregateBytes + prepared.data.byteLength >
          limits.maxMessageImageBytes
        ) {
          throw new Error(
            `Queued images exceed the ${limits.maxMessageImageBytes}-byte message limit`,
          );
        }
        const attachment = await client.saveImage(
          prepared.data,
          prepared.mediaType,
          prepared.name,
        );
        pendingAttachmentsRef.current = [
          ...pendingAttachmentsRef.current,
          attachment,
        ];
        flushState();
        notify(
          `Attached ${attachment.name ?? "image"} (${attachment.width}×${attachment.height})`,
        );
      } finally {
        release();
      }
    },
    [flushState, notify, requireClient],
  );

  const clearAttachments = useCallback(() => {
    const release = operationLockRef.current.acquire("clear attachments");
    try {
      pendingAttachmentsRef.current = [];
      flushState();
    } finally {
      release();
    }
  }, [flushState]);

  const respondApproval = useCallback(
    async (requestId: string, outcome: "allowed-once" | "rejected") => {
      const release = operationLockRef.current.acquire("respond to approval");
      try {
        const result = await requireClient().respondApproval(
          requestId,
          outcome,
        );
        if (!result.accepted)
          notify(
            `Approval response rejected (${result.reason ?? "not accepted"})`,
          );
        pendingInteractionsRef.current = applyInteractionReceipt(
          pendingInteractionsRef.current,
          requestId,
          result,
        );
        flushState();
      } finally {
        release();
      }
    },
    [flushState, notify, requireClient],
  );

  const respondQuestion = useCallback(
    async (requestId: string, answer: QuestionAnswer) => {
      const release = operationLockRef.current.acquire("answer a question");
      try {
        const result = await requireClient().respondQuestion(requestId, answer);
        if (!result.accepted)
          notify(
            `Question response rejected (${result.reason ?? "not accepted"})`,
          );
        pendingInteractionsRef.current = applyInteractionReceipt(
          pendingInteractionsRef.current,
          requestId,
          result,
        );
        flushState();
      } finally {
        release();
      }
    },
    [flushState, notify, requireClient],
  );

  const cancelQuestion = useCallback(
    async (requestId: string) => {
      const release = operationLockRef.current.acquire("cancel a question");
      try {
        const result = await requireClient().cancelQuestion(requestId);
        if (!result.accepted)
          notify(
            `Question cancellation rejected (${result.reason ?? "not accepted"})`,
          );
        pendingInteractionsRef.current = applyInteractionReceipt(
          pendingInteractionsRef.current,
          requestId,
          result,
        );
        flushState();
      } finally {
        release();
      }
    },
    [flushState, notify, requireClient],
  );

  const clearView = useCallback(() => {
    const release = operationLockRef.current.acquire("clear the transcript");
    try {
      messagesRef.current = [];
      streamingRef.current = "";
      assistantIdRef.current = null;
      flushState();
    } finally {
      release();
    }
  }, [flushState]);

  const cancel = useCallback(async () => {
    const release = operationLockRef.current.acquire("cancel the active turn");
    try {
      const requested = await requireClient().cancelSession(
        sessionIdRef.current,
      );
      if (!requested) notify("No active turn to cancel");
      return requested;
    } finally {
      release();
    }
  }, [notify, requireClient]);

  const listCommands = useCallback(async () => {
    const release = operationLockRef.current.acquire("list commands");
    try {
      return await requireClient().listCommands(sessionIdRef.current);
    } finally {
      release();
    }
  }, [requireClient]);

  const executeCommand = useCallback(
    async (line: string) => {
      const release = operationLockRef.current.acquire("execute a command");
      try {
        setActivity(`running ${line}`);
        flushState();
        return await requireClient().executeCommand(sessionIdRef.current, line);
      } finally {
        setActivity(null);
        flushState();
        release();
      }
    },
    [flushState, requireClient, setActivity],
  );

  const listSkills = useCallback(async () => {
    const release = operationLockRef.current.acquire("list skills");
    try {
      // Skills are discovered from the workspace's project roots, so the
      // active directory has to travel with the call; omitting it lists none.
      return await requireClient().listSkills(workspaceDirectoryRef.current);
    } finally {
      release();
    }
  }, [requireClient]);

  const listAgentPresets = useCallback(async () => {
    const release = operationLockRef.current.acquire("list agent presets");
    try {
      return await requireClient().listAgentPresets();
    } finally {
      release();
    }
  }, [requireClient]);

  const getSettings = useCallback(async (): Promise<SettingsGetResult> => {
    const release = operationLockRef.current.acquire("get settings");
    try {
      return await requireClient().getSettings();
    } finally {
      release();
    }
  }, [requireClient]);

  const setSettings = useCallback(
    async (params: SettingsSetParams): Promise<SettingsSetResult> => {
      const release = operationLockRef.current.acquire("set settings");
      try {
        return await requireClient().setSettings(params);
      } finally {
        release();
      }
    },
    [requireClient],
  );

  const setWorkspaceDirectory = useCallback(
    async (directory: string): Promise<void> => {
      const release = operationLockRef.current.acquire(
        "set workspace directory",
      );
      try {
        const target = resolve(directory);
        const info = await stat(target);
        if (!info.isDirectory()) {
          throw new Error(`Not a directory: ${target}`);
        }
        workspaceDirectoryRef.current = target;
        // Re-initialize so new sessions pick up the updated meta.cwd. The
        // runtime's initialize is idempotent; the subprocess's DSH_CWD env
        // stays at its startup value (bash/fs tools keep the original cwd).
        await requireClient().initialize({
          cwd: target,
          provider: routeRef.current.provider,
          model: routeRef.current.model,
          maxTokens,
        });
        notify(`Workspace directory: ${target}`);
        flushState();
      } finally {
        release();
      }
    },
    [flushState, maxTokens, notify, requireClient],
  );

  const providerAuthInfo = useCallback(
    (provider: string) => requireClient().providerAuthInfo(provider),
    [requireClient],
  );

  const startProviderAuth = useCallback(
    async (
      provider: string,
      type: "api_key" | "oauth",
      onNotification: (notification: HarnessNotification) => void,
    ): Promise<string> => {
      const client = requireClient();
      const subscription = client.subscribe((notification) =>
        notification.method.startsWith("provider.auth."),
      );
      authSubscriptionsRef.current.add(subscription);
      try {
        const { flowId } = await client.startProviderAuth(provider, type);
        void (async () => {
          try {
            for await (const notification of subscription) {
              if (notification.params.flowId !== flowId) continue;
              onNotification(notification);
              if (notification.method === "provider.auth.finished") break;
            }
          } catch {
            // Runtime shutdown owns subscription closure.
          } finally {
            subscription.close();
            authSubscriptionsRef.current.delete(subscription);
          }
        })();
        return flowId;
      } catch (error) {
        subscription.close();
        authSubscriptionsRef.current.delete(subscription);
        throw error;
      }
    },
    [requireClient],
  );

  const respondProviderAuth = useCallback(
    async (flowId: string, promptId: string, value: string) => {
      return (
        await requireClient().respondProviderAuth(flowId, promptId, value)
      ).accepted;
    },
    [requireClient],
  );

  const cancelProviderAuth = useCallback(
    async (flowId: string) => {
      return (await requireClient().cancelProviderAuth(flowId)).requested;
    },
    [requireClient],
  );

  const logoutProvider = useCallback(
    async (provider: string) => {
      await requireClient().logoutProvider(provider);
    },
    [requireClient],
  );

  const shutdown = useCallback(() => {
    shutdownTaskRef.current ??= (async () => {
      stopSubscription();
      const client = clientRef.current;
      if (client) {
        await Promise.allSettled(
          pendingInteractionsRef.current.map((interaction) =>
            interaction.kind === "approval"
              ? client.respondApproval(interaction.requestId, "rejected")
              : client.cancelQuestion(interaction.requestId),
          ),
        );
      }
      pendingInteractionsRef.current = [];
      queuedPromptsRef.current.clear();
      interactionSubscriptionRef.current?.close();
      interactionSubscriptionRef.current = null;
      for (const subscription of authSubscriptionsRef.current)
        subscription.close();
      authSubscriptionsRef.current.clear();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      await client?.close();
      clientRef.current = null;
    })();
    return shutdownTaskRef.current;
  }, [stopSubscription]);

  return {
    state,
    sendMessage,
    catalog,
    selectModel,
    selectReasoning,
    newSession,
    listSessions,
    resumeSession,
    addAttachment,
    clearAttachments,
    respondApproval,
    respondQuestion,
    cancelQuestion,
    clearView,
    cancel,
    listCommands,
    executeCommand,
    listSkills,
    listAgentPresets,
    getSettings,
    setSettings,
    setWorkspaceDirectory,
    providerAuthInfo,
    startProviderAuth,
    respondProviderAuth,
    cancelProviderAuth,
    logoutProvider,
    notify,
    shutdown,
  };
}
