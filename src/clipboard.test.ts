import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRendererClipboardAdapter,
  type ClipboardWriteResult,
} from "@opentui/core";
import { clipboardResultMessage } from "./clipboard.ts";

const notAttempted: ClipboardWriteResult["terminal"] = {
  status: "not-attempted",
  capability: "unknown",
};

test("reports verified host writes separately from OSC52 attempts and failures", () => {
  assert.equal(
    clipboardResultMessage(
      {
        host: { status: "written" },
        terminal: notAttempted,
      },
      "transcript",
    ),
    "Copied transcript to host clipboard.",
  );
  assert.match(
    clipboardResultMessage(
      {
        host: { status: "unsupported" },
        terminal: { status: "attempted", capability: "unknown" },
      },
      "message",
    ),
    /delivery cannot be verified/,
  );
  assert.equal(
    clipboardResultMessage(
      {
        host: { status: "failed", error: new Error("denied") },
        terminal: notAttempted,
      },
      "message",
    ),
    "Clipboard failed: denied",
  );
  assert.match(
    clipboardResultMessage(
      {
        host: { status: "unsupported" },
        terminal: { status: "local-failure", capability: "unknown" },
      },
      "message",
    ),
    /failed/,
  );
});

test("public renderer adapter preserves remote and unknown capability state", () => {
  const adapter = createRendererClipboardAdapter({
    capabilities: { remote: true, osc52_support: "unknown" },
    copyToClipboardOSC52: () => true,
    clearClipboardOSC52: () => true,
  });
  assert.equal(adapter.remote, true);
  assert.deepEqual(adapter.writeText("text", "clipboard"), {
    status: "attempted",
    capability: "unknown",
  });
});
