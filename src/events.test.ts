import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatMessage } from "./types.ts";
import { activityForEvent, processEvent } from "./useHarness.ts";

test("projects direct user data, tool correlation, and cancelled partial output", () => {
  const messages: ChatMessage[] = [];
  const usage = { input: 0, output: 0 };
  let stream = { streamingText: "", assistantId: null as string | null };
  const apply = (event: Record<string, unknown>): void => {
    stream = processEvent(event, messages, { ...stream, usage });
  };

  apply({
    type: "user/message",
    data: { source: { kind: "user" }, content: [{ type: "text", text: "hi" }] },
  });
  apply({
    type: "tool/call",
    data: { callId: "call-1", name: "read", arguments: "{}", turn: 1, step: 1 },
  });
  apply({
    type: "tool/result",
    data: {
      message: {
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            content: [{ type: "text", text: "done" }],
            isError: false,
          },
        ],
        source: { kind: "tool", callId: "call-1" },
      },
    },
  });
  apply({
    type: "assistant/chunk",
    data: { chunk: { type: "text-delta", text: "partial" }, turn: 1, step: 2 },
  });
  apply({
    type: "turn/end",
    data: { reason: { kind: "aborted", reason: { kind: "user" } } },
  });

  assert.equal(messages[0]?.content, "hi");
  assert.equal(messages[1]?.toolCallId, "call-1");
  assert.equal(messages[2]?.toolCallId, "call-1");
  assert.equal(messages[2]?.content, "done");
  assert.equal(messages[2]?.toolError, false);
  assert.equal(messages[3]?.content, "partial");
  assert.equal(messages[4]?.content, "Turn cancelled");
  assert.deepEqual(stream, { streamingText: "", assistantId: null });
});

test("keeps reasoning out of answer markdown and exposes long-running activity", () => {
  const messages: ChatMessage[] = [];
  const usage = { input: 0, output: 0 };
  const reasoning = {
    type: "assistant/chunk",
    data: { chunk: { type: "reasoning-delta", text: "private thought" } },
  };
  const stream = processEvent(reasoning, messages, {
    streamingText: "",
    assistantId: null,
    usage,
  });

  assert.deepEqual(messages, []);
  assert.deepEqual(stream, { streamingText: "", assistantId: null });
  assert.equal(activityForEvent(reasoning, "waiting for model"), "thinking");
  assert.equal(
    activityForEvent({ type: "compaction/start", data: {} }, "thinking"),
    "compacting context",
  );
  assert.equal(
    activityForEvent(
      { type: "compaction/end", data: {} },
      "compacting context",
    ),
    "resuming after compaction",
  );
  assert.equal(
    activityForEvent({ type: "tool/call", data: { name: "read" } }, "thinking"),
    "running read",
  );
});
