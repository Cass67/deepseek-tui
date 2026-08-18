/**
 * Individual message rendering: markdown for assistant, text for user/status.
 */

import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import { useSyntaxStyle, useTheme } from "./theme.tsx";
import type { ChatMessage } from "./types.ts";

interface MessageBubbleProps {
  message: ChatMessage;
  streamingContent?: string;
}

const ROLE_LABELS: Record<string, string> = {
  user: "❯ you",
  assistant: "◆ deepseek",
  status: "ℹ status",
};

export const MessageBubble = memo(function MessageBubble({
  message,
  streamingContent,
}: MessageBubbleProps) {
  const theme = useTheme();
  const markdownStyle = useSyntaxStyle();
  const color =
    message.role === "user"
      ? theme.primary
      : message.role === "status"
        ? theme.textMuted
        : theme.text;
  const label = ROLE_LABELS[message.role] ?? message.role;

  // Status messages: simple muted text
  if (message.role === "status") {
    return (
      <box
        style={{
          flexDirection: "column",
          width: "100%",
          paddingX: 1,
        }}
      >
        <text fg={color}>{message.content}</text>
      </box>
    );
  }

  // Todo list: a bordered panel with a header and per-item status markers.
  if (message.role === "todo") {
    const todos = message.todos ?? [];
    const done = todos.filter((t) => t.status === "completed").length;
    return (
      <box
        style={{
          flexDirection: "column",
          width: "100%",
          border: true,
          borderColor: theme.border,
          backgroundColor: theme.surface,
          paddingX: 2,
          paddingY: 1,
        }}
      >
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          ☑ todos {todos.length > 0 ? `${done}/${todos.length}` : ""}
        </text>
        {todos.length === 0 ? (
          <text fg={theme.textMuted}>{message.content}</text>
        ) : (
          todos.map((todo, index) => (
            <text
              key={index}
              fg={
                todo.status === "completed"
                  ? theme.textMuted
                  : todo.status === "in_progress"
                    ? theme.primary
                    : theme.text
              }
              attributes={
                todo.status === "in_progress"
                  ? TextAttributes.BOLD
                  : undefined
              }
            >
              {todo.status === "completed"
                ? "✓"
                : todo.status === "in_progress"
                  ? "→"
                  : "○"}{" "}
              {todo.content}
            </text>
          ))
        )}
      </box>
    );
  }

  // User messages: distinct surface without adding another heavy border
  if (message.role === "user") {
    return (
      <box
        style={{
          flexDirection: "column",
          width: "100%",
          backgroundColor: theme.surface,
          paddingX: 2,
          paddingY: 1,
        }}
      >
        <text fg={color} attributes={TextAttributes.BOLD}>
          {label}
        </text>
        {message.content && <text fg={theme.text}>{message.content}</text>}
        {message.attachments?.map((attachment) => (
          <text key={String(attachment.attachmentId)} fg={theme.secondary}>
            ▣ {attachment.name ?? "image"} · {attachment.mediaType} ·{" "}
            {attachment.width}×{attachment.height}
          </text>
        ))}
      </box>
    );
  }

  // Assistant messages: markdown with streaming support
  const content = streamingContent ?? message.content;
  if (!content) return null;

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        paddingX: 2,
        paddingY: 1,
      }}
    >
      <text fg={color} attributes={TextAttributes.BOLD}>
        {label}
      </text>
      <markdown
        content={content}
        syntaxStyle={markdownStyle}
        conceal={true}
        concealCode={false}
        streaming={!!streamingContent}
        internalBlockMode="top-level"
        tableOptions={{ borderColor: theme.border }}
        fg={theme.text}
        bg={theme.background}
      />
      {message.usage && (
        <text fg={theme.textMuted}>
          tokens: {message.usage.inputTokens ?? 0} in /{" "}
          {message.usage.outputTokens ?? 0} out
        </text>
      )}
    </box>
  );
});
