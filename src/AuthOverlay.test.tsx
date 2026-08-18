import assert from "node:assert/strict";
import test from "node:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { AuthOverlay } from "./AuthOverlay.tsx";
import { ThemeProvider } from "./theme.tsx";

test("auth overlay conceals secret and manual-code input", async () => {
  for (const type of ["secret", "manual_code"] as const) {
    const setup = await testRender(
      <ThemeProvider name="tokyo-night">
        <AuthOverlay
          provider="provider"
          lines={["Safe progress"]}
          prompt={{ id: "prompt", type, message: "Enter value" }}
          input="never-render-this"
        />
      </ThemeProvider>,
      { width: 80, height: 20 },
    );
    try {
      await act(async () => {
        await setup.flush();
      });
      const frame = setup.captureCharFrame();
      assert.doesNotMatch(frame, /never-render-this/);
      assert.match(frame, /••••/);
    } finally {
      await act(async () => {
        setup.renderer.destroy();
      });
    }
  }
});
