/**
 * Shared types for the deepseek-tui chat interface.
 */

import type {
  ImageAttachmentRef,
  InteractionRequestedNotification,
} from "@deepseek-ai/dsh-sdk-client";

/** One item in the agent's live todo list. */
export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

/** A delegated subagent child, tracked from `subagent` tool calls. */
export interface SubagentInfo {
  id: string;
  description: string;
  status: "running" | "done";
}

/** A background job, tracked from `job_list` tool results. */
export interface JobInfo {
  id: string;
  kind: string;
  label: string;
  status: "running" | "stopping" | "completed" | "killed" | "failed";
}

/** The active goal, tracked from `goal/change` session events. */
export interface GoalInfo {
  id: string;
  objective: string;
  phase: "active" | "paused" | "blocked" | "complete";
  maxGoalRounds: number;
  roundsStarted: number;
}

/** One member (sub-agent step) of a workflow run. */
export interface WorkflowMember {
  seq: number;
  label: string;
  phase?: string;
  outcome?: "completed" | "failed" | "cancelled";
}

/** A workflow run, tracked from `tool-workflow/*` session events. */
export interface WorkflowRun {
  runId: string;
  name: string;
  ended: boolean;
  members: WorkflowMember[];
}

/** A feedback entry, tracked from `feedback/record` session events. */
export interface FeedbackEntry {
  text: string;
  timestamp: number;
}

/** A single message in the chat view. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_result" | "status" | "todo";
  content: string;
  toolName?: string;
  toolArgs?: string;
  toolCallId?: string;
  toolError?: boolean;
  attachments?: ImageAttachmentRef[];
  /** Structured todo list for `role: "todo"` messages. */
  todos?: TodoItem[];
  turn?: number;
  step?: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  timestamp: number;
}

/** Agent lifecycle status from the wire. */
export type AgentStatus = "idle" | "running" | "connecting" | "error";

/** Application state shared across components. */
export interface AppState {
  messages: ChatMessage[];
  status: AgentStatus;
  activity: string | null;
  activitySince: number | null;
  sessionId: string;
  model: string;
  provider: string;
  reasoningEffort?: string;
  tokenUsage: { input: number; output: number };
  currentStreamingText: string;
  pendingAttachments: ImageAttachmentRef[];
  queuedPromptCount: number;
  pendingInteractions: InteractionRequestedNotification[];
  /** Whether the agent is currently in plan mode (last `plan/mode` event wins). */
  planModeActive: boolean;
  /** Delegated subagent children (from `subagent` tool calls). */
  subagents: SubagentInfo[];
  /** Background jobs (from the latest `job_list` tool result). */
  jobs: JobInfo[];
  /** The active goal (from `goal/change` events), or null when cleared. */
  goal: GoalInfo | null;
  /** Workflow runs (from `tool-workflow/*` events). */
  workflowRuns: WorkflowRun[];
  /** Feedback entries (from `feedback/record` events). */
  feedback: FeedbackEntry[];
}
