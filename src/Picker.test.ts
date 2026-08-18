import assert from "node:assert/strict";
import { test } from "node:test";
import { fuzzyPickerOptions } from "./Picker.tsx";

test("picker prefers contiguous matches and uses fuzzy matching only as fallback", () => {
  const options = [
    {
      value: "qwen",
      name: "Qwen Max — Qwen Token Plan",
      description: "qwen-token-plan/qwen3.8-max",
    },
    {
      value: "opencode",
      name: "Qwen Plus — opencode-go",
      description: "opencode-go/qwen3.6-plus",
    },
    {
      value: "codex",
      name: "GPT-5 Codex — OpenAI",
      description: "openai-codex/gpt-5-codex",
    },
    { value: "other", name: "Code Expert", description: "other/model" },
  ];

  assert.deepEqual(
    fuzzyPickerOptions(options, "opencode").map((option) => option.value),
    ["opencode"],
  );
  assert.deepEqual(
    fuzzyPickerOptions(options, "codex").map((option) => option.value),
    ["codex"],
  );
  assert.deepEqual(
    fuzzyPickerOptions(options, "qtp").map((option) => option.value),
    ["qwen"],
  );
  assert.equal(fuzzyPickerOptions(options, ""), options);
});
