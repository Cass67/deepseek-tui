/** Process-wide bridge from terminal signals to the mounted Harness owner. */

let handler: (() => Promise<void>) | undefined;
let shutdownTask: Promise<void> | undefined;

/** Register the mounted application's quiescent shutdown operation. */
export function registerShutdown(next: () => Promise<void>): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = undefined;
  };
}

/** Run registered shutdown once; concurrent quit paths share completion. */
export function requestShutdown(): Promise<void> {
  shutdownTask ??= handler?.() ?? Promise.resolve();
  return shutdownTask;
}
