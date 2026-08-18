import assert from "node:assert/strict";
import { test } from "node:test";
import {
  searchTranscript,
  serializeTranscript,
  withStreamingText,
} from "./transcript.ts";
import type { ChatMessage } from "./types.ts";

const messages: ChatMessage[] = [
  { id: "1", role: "user", content: "Explain Alpha behavior", timestamp: 1 },
  {
    id: "2",
    role: "assistant",
    content: "Alpha is case insensitive.",
    timestamp: 2,
  },
  { id: "3", role: "status", content: "local only", timestamp: 3 },
  { id: "4", role: "user", content: "Thanks", timestamp: 4 },
];

test("searches case-insensitively and serializes copy scopes without status entries", () => {
  assert.deepEqual(
    searchTranscript(messages, "ALPHA").map((hit) => hit.label),
    ["you", "assistant"],
  );
  assert.match(
    serializeTranscript(messages, "all"),
    /\[you\]\nExplain Alpha behavior/,
  );
  assert.doesNotMatch(serializeTranscript(messages, "all"), /local only/);
  assert.equal(serializeTranscript(messages, "last"), "[you]\nThanks");
  assert.deepEqual(searchTranscript(messages, "missing"), []);
});

test("projects current assistant streaming text into search and copy", () => {
  const streaming = withStreamingText(messages, "live partial answer");
  assert.equal(searchTranscript(streaming, "PARTIAL").length, 1);
  assert.equal(
    serializeTranscript(streaming, "last"),
    "[assistant]\nlive partial answer",
  );
  assert.equal(messages[1]?.content, "Alpha is case insensitive.");
});
