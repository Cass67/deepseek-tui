/** OpenTUI clipboard composition and truthful result messaging. */

import {
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
  type ClipboardService,
  type ClipboardWriteResult,
  type CliRenderer,
} from "@opentui/core";

/** Create the public OpenTUI host + renderer clipboard service. */
export function createRendererClipboard(
  renderer: CliRenderer,
): ClipboardService {
  return createClipboard({
    host: createHostClipboard(),
    terminal: createRendererClipboardAdapter(renderer),
  });
}

/** Describe verified host writes separately from unverifiable OSC52 attempts. */
export function clipboardResultMessage(
  result: ClipboardWriteResult,
  label: string,
): string {
  if (result.host.status === "written")
    return `Copied ${label} to host clipboard.`;
  if (result.terminal.status === "attempted") {
    const attempt = `Sent ${label} through terminal clipboard; delivery cannot be verified.`;
    return result.host.status === "failed"
      ? `Host clipboard failed: ${result.host.error.message}. ${attempt}`
      : attempt;
  }
  if (result.host.status === "failed")
    return `Clipboard failed: ${result.host.error.message}`;
  if (result.terminal.status === "local-failure")
    return "Terminal clipboard write failed.";
  if (result.host.status === "timed-out")
    return "Host clipboard write timed out.";
  if (result.host.status === "cancelled")
    return "Clipboard write was cancelled.";
  return "Clipboard is unsupported by this terminal and host.";
}
