import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  COMMANDS,
  commandSuggestions,
  formatCommandSuggestions,
  parseInput,
} from "./commands.ts";

describe("command input", () => {
  test("separates messages, local command arguments, and unresolved commands", () => {
    assert.deepEqual(parseInput(" hi "), { kind: "message", text: "hi" });
    assert.deepEqual(parseInput("/model qwen3.8-max"), {
      kind: "command",
      name: "model",
      args: "qwen3.8-max",
      line: "/model qwen3.8-max",
    });
    assert.deepEqual(parseInput('!printf "hello world"'), {
      kind: "shell",
      command: 'printf "hello world"',
    });
    assert.deepEqual(parseInput("/PLUGIN arg"), {
      kind: "command",
      name: "plugin",
      args: "arg",
      line: "/PLUGIN arg",
    });
    assert.deepEqual(
      commandSuggestions("/pro").map((command) => command.name),
      ["provider"],
    );
    assert.deepEqual(
      commandSuggestions("/rea").map((command) => command.name),
      ["reasoning"],
    );
    assert.deepEqual(
      commandSuggestions("/s").map((command) => command.name),
      ["status", "sessions", "search", "shell"],
    );
    assert.deepEqual(commandSuggestions("/model q"), []);

    const all = commandSuggestions("/", [
      { name: "compact", description: "runtime duplicate" },
      {
        name: "doctor",
        description: "Inspect runtime",
        input: { hint: "[scope]" },
      },
    ]);
    assert.equal(all.length, COMMANDS.length + 1);
    assert.deepEqual(
      all.find((command) => command.name === "doctor"),
      {
        name: "doctor",
        usage: "/doctor [scope]",
        description: "Inspect runtime",
      },
    );
    const rendered = formatCommandSuggestions(all, 46);
    for (const command of all)
      assert.match(rendered, new RegExp(`/${command.name}`));
    assert.ok(rendered.split("\n").every((line) => line.length <= 46));
  });
});
