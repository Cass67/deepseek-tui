/**
 * Shared types for the deepseek-tui chat interface.
 */

import type {
  ImageAttachmentRef,
  InteractionRequestedNotification,
} from "@deepseek-ai/dsh-sdk-client";

/** A single message in the chat view. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_result" | "status";
  content: string;
  toolName?: string;
  toolArgs?: string;
  toolCallId?: string;
  toolError?: boolean;
  attachments?: ImageAttachmentRef[];
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
}
