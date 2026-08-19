import assert from "node:assert/strict";
import test from "node:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { FeedbackPanel } from "./FeedbackPanel.tsx";
import { ThemeProvider } from "./theme.tsx";
import type { FeedbackEntry } from "./types.ts";

test("feedback panel renders nothing when empty", async () => {
  const setup = await testRender(
    <ThemeProvider name="tokyo-night">
      <FeedbackPanel feedback={[]} />
    </ThemeProvider>,
    { width: 80, height: 10 },
  );
  try {
    await act(async () => {
      await setup.flush();
    });
    const frame = setup.captureCharFrame();
    assert.doesNotMatch(frame, /feedback/);
  } finally {
    await act(async () => {
      setup.renderer.destroy();
    });
  }
});

test("feedback panel renders entries with count", async () => {
  const feedback: FeedbackEntry[] = [
    { text: "great answer", timestamp: Date.now() },
    { text: "could be better", timestamp: Date.now() },
  ];
  const setup = await testRender(
    <ThemeProvider name="tokyo-night">
      <FeedbackPanel feedback={feedback} />
    </ThemeProvider>,
    { width: 80, height: 10 },
  );
  try {
    await act(async () => {
      await setup.flush();
    });
    const frame = setup.captureCharFrame();
    assert.match(frame, /feedback 2/);
    assert.match(frame, /great answer/);
    assert.match(frame, /could be better/);
  } finally {
    await act(async () => {
      setup.renderer.destroy();
    });
  }
});

test("feedback panel truncates to most recent entries", async () => {
  const feedback: FeedbackEntry[] = Array.from({ length: 8 }, (_, i) => ({
    text: `entry ${i + 1}`,
    timestamp: Date.now(),
  }));
  const setup = await testRender(
    <ThemeProvider name="tokyo-night">
      <FeedbackPanel feedback={feedback} />
    </ThemeProvider>,
    { width: 80, height: 20 },
  );
  try {
    await act(async () => {
      await setup.flush();
    });
    const frame = setup.captureCharFrame();
    assert.match(frame, /feedback 8/);
    assert.match(frame, /3 earlier/);
    // Most recent entries are shown.
    assert.match(frame, /entry 8/);
    assert.match(frame, /entry 4/);
    // Oldest entries are truncated.
    assert.doesNotMatch(frame, /entry 1/);
  } finally {
    await act(async () => {
      setup.renderer.destroy();
    });
  }
});
