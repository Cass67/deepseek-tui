/** Scrollable, culled chat message list with streaming support. */

import { useMemo } from "react";
import { MessageBubble } from "./MessageBubble.tsx";
import { ToolCard } from "./ToolCard.tsx";
import type { ChatMessage } from "./types.ts";

interface ChatViewProps {
  messages: ChatMessage[];
  streamingText: string;
  showReasoning: boolean;
}

export function ChatView({
  messages,
  streamingText,
  showReasoning,
}: ChatViewProps) {
  const results = useMemo(
    () =>
      new Map(
        messages
          .filter(
            (message) => message.role === "tool_result" && message.toolCallId,
          )
          .map((message) => [message.toolCallId as string, message]),
      ),
    [messages],
  );
  const lastAssistant = useMemo(
    () => findLastAssistantIndex(messages),
    [messages],
  );

  return (
    <scrollbox
      style={{
        flexGrow: 1,
        width: "100%",
        paddingX: 1,
        paddingY: 1,
      }}
      stickyScroll={true}
      stickyStart="bottom"
    >
      {messages.map((message, index) => {
        if (message.role === "tool_call") {
          const result = message.toolCallId
            ? results.get(message.toolCallId)
            : undefined;
          return (
            <ToolCard
              key={message.id}
              name={message.toolName ?? "unknown"}
              args={message.toolArgs ?? ""}
              result={result?.content}
              running={result === undefined}
              failed={result?.toolError === true}
            />
          );
        }
        if (message.role === "tool_result") return null;

        const isStreamingAssistant =
          message.role === "assistant" &&
          index === lastAssistant &&
          streamingText.length > 0;

        return (
          <MessageBubble
            key={message.id}
            message={message}
            streamingContent={isStreamingAssistant ? streamingText : undefined}
            showReasoning={showReasoning}
          />
        );
      })}
    </scrollbox>
  );
}

function findLastAssistantIndex(messages: ChatMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return index;
  }
  return -1;
}
