import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ModelCatalogResult,
  SessionHistoryEvent,
} from "@deepseek-ai/dsh-sdk-client";
import { catalogRoute, sessionPresentation } from "./sessions.ts";
import { replayHistory } from "./useHarness.ts";

const events = [
  { type: "session/title", seq: 0, time: 1, data: { title: "Earlier" } },
  {
    type: "user/message",
    seq: 1,
    time: 2,
    data: {
      source: { kind: "plugin" },
      content: [{ type: "text", text: "hidden runtime context" }],
    },
  },
  {
    type: "user/message",
    seq: 2,
    time: 3,
    data: {
      source: { kind: "user" },
      content: [
        { type: "text", text: "look" },
        {
          type: "image",
          attachment: {
            attachmentId: "sha256:image",
            mediaType: "image/png",
            bytes: 3,
            width: 1,
            height: 2,
            name: "shot.png",
          },
        },
      ],
    },
  },
  {
    type: "request/header",
    seq: 3,
    time: 4,
    data: {
      header: {
        config: {
          provider: "qwen-token-plan",
          model: "qwen-image",
          reasoningEffort: "high",
        },
      },
    },
  },
  {
    type: "request/context",
    seq: 4,
    time: 5,
    data: { provider: "qwen-token-plan", model: "stale-context-model" },
  },
  {
    type: "assistant/message",
    seq: 5,
    time: 6,
    data: {
      message: { content: [{ type: "text", text: "seen" }] },
      usage: { inputTokens: 10, outputTokens: 2 },
    },
  },
  { type: "session/title", seq: 6, time: 7, data: { title: "Latest" } },
] as unknown as SessionHistoryEvent[];

test("replays visible history once and restores latest catalog-valid route", () => {
  const replayed = replayHistory(events);
  assert.deepEqual(
    replayed.messages.map((message) => [message.role, message.content]),
    [
      ["user", "look"],
      ["assistant", "seen"],
    ],
  );
  assert.equal(replayed.messages[0]?.attachments?.[0]?.name, "shot.png");
  assert.deepEqual(replayed.usage, { input: 10, output: 2 });

  const presentation = sessionPresentation(events);
  assert.deepEqual(presentation, {
    title: "Latest",
    provider: "qwen-token-plan",
    model: "qwen-image",
    reasoningEffort: "high",
  });
  const catalog = {
    providers: [
      {
        id: "qwen-token-plan",
        name: "Qwen",
        models: [
          {
            id: "qwen-image",
            name: "Image",
            reasoning: { efforts: [{ id: "high", name: "High" }] },
          },
        ],
      },
    ],
    failures: [],
  } satisfies ModelCatalogResult;
  assert.deepEqual(catalogRoute(presentation, catalog), {
    provider: "qwen-token-plan",
    model: "qwen-image",
    reasoningEffort: "high",
  });
  assert.equal(
    catalogRoute(presentation, { providers: [], failures: [] }),
    undefined,
  );
});
