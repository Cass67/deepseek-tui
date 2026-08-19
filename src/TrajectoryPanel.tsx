import { TextAttributes } from "@opentui/core";
import type { TrajectoryEntry } from "./types.ts";
import { useTheme } from "./theme.tsx";

interface TrajectoryPanelProps {
  entries: readonly TrajectoryEntry[];
}

/** Format a timestamp as HH:MM:SS for the trajectory gutter. */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

/**
 * Full-height trajectory (event log) panel. Shows a bounded, newest-last log
 * of the agent's activity: user/assistant messages, tool calls and results,
 * and turn/step boundaries. Auto-scrolls to the latest entry.
 */
export function TrajectoryPanel({ entries }: TrajectoryPanelProps) {
  const theme = useTheme();
  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        width: "100%",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.secondary,
        paddingX: 2,
        paddingY: 1,
        gap: 1,
      }}
    >
      <text fg={theme.secondary} attributes={TextAttributes.BOLD}>
        Trajectory ({entries.length})
      </text>
      {entries.length === 0 ? (
        <text fg={theme.textMuted}>No events yet.</text>
      ) : (
        <scrollbox
          style={{ flexGrow: 1, width: "100%" }}
          stickyScroll={true}
          stickyStart="bottom"
          focused={true}
        >
          <box style={{ flexDirection: "column", width: "100%" }}>
            {entries.map((entry) => (
              <box
                key={entry.id}
                style={{ flexDirection: "row", width: "100%", gap: 1 }}
              >
                <text fg={theme.textMuted}>{formatTime(entry.timestamp)}</text>
                <text fg={theme.text}>{entry.summary}</text>
              </box>
            ))}
          </box>
        </scrollbox>
      )}
      <text fg={theme.textMuted}>Esc to close</text>
    </box>
  );
}
