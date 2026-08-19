import { TextAttributes } from "@opentui/core";
import type { DeliverableEntry } from "./types.ts";
import { useTheme } from "./theme.tsx";

interface DeliverablesPanelProps {
  entries: readonly DeliverableEntry[];
}

/**
 * Full-height deliverables panel. Lists the files the agent wrote or edited
 * and the commands it ran, tracked from mutating tool calls. Newest last,
 * auto-scrolls to the latest entry.
 */
export function DeliverablesPanel({ entries }: DeliverablesPanelProps) {
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
        Deliverables ({entries.length})
      </text>
      {entries.length === 0 ? (
        <text fg={theme.textMuted}>
          Nothing produced yet. Files written, edited, or commands run will
          appear here.
        </text>
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
                <text fg={theme.primary}>{entry.action}</text>
                <text fg={theme.text}>{entry.target}</text>
              </box>
            ))}
          </box>
        </scrollbox>
      )}
      <text fg={theme.textMuted}>Esc to close</text>
    </box>
  );
}
