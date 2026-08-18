import assert from "node:assert/strict";
import { test } from "node:test";
import type { InteractionRequestedNotification } from "@deepseek-ai/dsh-sdk-client";
import {
  applyInteractionReceipt,
  buildQuestionAnswer,
  enqueueInteraction,
  interactionRequest,
  resolveInteraction,
} from "./interactions.ts";

const question = {
  kind: "question",
  requestId: "request-1",
  sessionId: "session-1",
  questions: [
    {
      id: "mode",
      question: "Modes?",
      options: [{ label: "Fast" }, { label: "Safe" }],
      multiSelect: true,
    },
    {
      id: "note",
      question: "Note?",
    },
  ],
} as InteractionRequestedNotification;

const approval = {
  kind: "approval",
  requestId: "request-2",
  sessionId: "session-1",
  approvalId: "approval-1",
  toolName: "bash",
} as InteractionRequestedNotification;

test("builds batched option/custom answers and handles duplicate/resolved queue races", () => {
  assert.deepEqual(
    buildQuestionAnswer(
      question.kind === "question" ? question.questions : [],
      {
        mode: "1, custom mode",
        note: "ship it",
      },
    ),
    {
      answers: [
        { id: "mode", selected: ["Fast"], custom: "custom mode" },
        { id: "note", selected: [], custom: "ship it" },
      ],
    },
  );

  let pending = enqueueInteraction([], question);
  pending = enqueueInteraction(pending, question);
  pending = enqueueInteraction(pending, approval);
  assert.deepEqual(
    pending.map((item) => item.requestId),
    ["request-1", "request-2"],
  );
  pending = applyInteractionReceipt(pending, "request-1", {
    accepted: false,
    reason: "bad-response",
  });
  assert.deepEqual(
    pending.map((item) => item.requestId),
    ["request-1", "request-2"],
  );
  pending = applyInteractionReceipt(pending, "request-1", {
    accepted: false,
    reason: "not-pending",
  });
  pending = resolveInteraction(pending, "request-1");
  assert.deepEqual(
    pending.map((item) => item.requestId),
    ["request-2"],
  );

  assert.equal(
    interactionRequest({ kind: "approval", requestId: "bad" }),
    undefined,
  );
  assert.equal(interactionRequest(question)?.requestId, "request-1");
});
