/**
 * Panel for recorded session feedback.
 *
 * Feedback entries are logged by the harness as `feedback/record` session
 * events (via the `/feedback` command). Each entry is a free-form human
 * remark about the session. The panel renders only when there are entries,
 * showing the most recent ones first.
 */

import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import { useTheme } from "./theme.tsx";
import type { FeedbackEntry } from "./types.ts";

interface FeedbackPanelProps {
  feedback: FeedbackEntry[];
}

/** Maximum number of entries to show before truncating to the most recent. */
const MAX_VISIBLE = 5;

/** Format a timestamp as HH:MM for the panel's compact display. */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export const FeedbackPanel = memo(function FeedbackPanel({
  feedback,
}: FeedbackPanelProps) {
  const theme = useTheme();
  if (feedback.length === 0) return null;

  const visible = feedback.slice(-MAX_VISIBLE);
  const hidden = feedback.length - visible.length;

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        border: true,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        paddingX: 2,
        paddingY: 1,
      }}
    >
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
        ✎ feedback {feedback.length}
      </text>
      {hidden > 0 && <text fg={theme.textMuted}>… {hidden} earlier</text>}
      {visible.map((entry, index) => (
        <text key={index} fg={theme.text}>
          {formatTimestamp(entry.timestamp)} {entry.text}
        </text>
      ))}
    </box>
  );
});
