/** Pure transcript search and serialization helpers. */

import type { ChatMessage } from "./types.ts";

export interface SearchHit {
  id: string;
  label: string;
  preview: string;
}

function roleLabel(message: ChatMessage): string {
  switch (message.role) {
    case "user":
      return "you";
    case "assistant":
      return "assistant";
    case "tool_call":
      return `tool ${message.toolName ?? "unknown"} call`;
    case "tool_result":
      return `tool ${message.toolName ?? "unknown"} result`;
    case "status":
      return "status";
  }
}

function searchableText(message: ChatMessage): string {
  return [message.content, message.toolName, message.toolArgs]
    .filter(Boolean)
    .join("\n");
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Find case-insensitive transcript matches in display order. */
export function searchTranscript(
  messages: readonly ChatMessage[],
  query: string,
): readonly SearchHit[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  return messages.flatMap((message) => {
    const text = searchableText(message);
    const index = text.toLocaleLowerCase().indexOf(needle);
    if (index === -1) return [];
    const start = Math.max(0, index - 40);
    const preview = oneLine(text.slice(start, start + 160));
    return [
      {
        id: message.id,
        label: roleLabel(message),
        preview: `${start > 0 ? "…" : ""}${preview}`,
      },
    ];
  });
}

/** Project current assistant stream into transcript operations without mutating session state. */
export function withStreamingText(
  messages: readonly ChatMessage[],
  currentStreamingText: string,
): readonly ChatMessage[] {
  if (!currentStreamingText) return messages;
  const assistantIndex = messages.findLastIndex(
    (message) => message.role === "assistant",
  );
  const conversationContinues = messages
    .slice(assistantIndex + 1)
    .some((message) => message.role !== "status");
  if (assistantIndex === -1 || conversationContinues) {
    return [
      ...messages,
      {
        id: "current-stream",
        role: "assistant",
        content: currentStreamingText,
        timestamp: 0,
      },
    ];
  }
  return messages.map((message, index) =>
    index === assistantIndex
      ? { ...message, content: currentStreamingText }
      : message,
  );
}

function serializeMessage(message: ChatMessage): string {
  const body =
    message.role === "tool_call"
      ? (message.toolArgs ?? message.content)
      : message.content;
  return `[${roleLabel(message)}]\n${body}`;
}

/** Serialize all conversation entries or the last user/assistant entry for clipboard copy. */
export function serializeTranscript(
  messages: readonly ChatMessage[],
  mode: "all" | "last",
): string {
  const conversation = messages.filter((message) => message.role !== "status");
  if (mode === "last") {
    const message = conversation.findLast(
      (candidate) =>
        candidate.role === "assistant" || candidate.role === "user",
    );
    return message ? serializeMessage(message) : "";
  }
  return conversation.map(serializeMessage).join("\n\n");
}
