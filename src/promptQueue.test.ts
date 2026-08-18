import assert from "node:assert/strict";
import { test } from "node:test";
import type { ImageAttachmentRef } from "@deepseek-ai/dsh-sdk-client";
import { PromptQueue } from "./promptQueue.ts";

test("queues follow-up prompts FIFO with attachment snapshots and one active drain", () => {
  const queue = new PromptQueue();
  const attachments = [
    { attachmentId: "sha256:a", name: "a.png" } as ImageAttachmentRef,
  ];

  assert.equal(queue.enqueue("first", attachments), 1);
  attachments.push({
    attachmentId: "sha256:b",
    name: "b.png",
  } as ImageAttachmentRef);
  assert.equal(queue.enqueue("second", []), 2);

  assert.deepEqual(queue.begin(), {
    text: "first",
    attachments: [attachments[0]],
  });
  assert.equal(queue.begin(), null);
  queue.finish();
  assert.deepEqual(queue.begin(), { text: "second", attachments: [] });
  queue.finish();
  assert.equal(queue.length, 0);
});
