#!/usr/bin/env bun
/** OpenTUI entry point with quiescent signal shutdown. */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App.tsx";
import { registerCodeParsers } from "./parsers.ts";
import { requestShutdown } from "./shutdown.ts";

const SIGNAL_SHUTDOWN_TIMEOUT_MS = 15_000;

registerCodeParsers();

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  exitSignals: [],
});
const root = createRoot(renderer);
let signalShutdown: Promise<void> | undefined;

const shutdownFromSignal = (): void => {
  signalShutdown ??= (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const shutdown = requestShutdown();
      renderer.destroy();
      await Promise.race([
        shutdown,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, SIGNAL_SHUTDOWN_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      process.exit(0);
    }
  })();
};

process.on("SIGINT", shutdownFromSignal);
process.on("SIGTERM", shutdownFromSignal);

root.render(<App />);
