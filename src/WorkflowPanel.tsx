/**
 * Panel for active and recent workflow runs.
 *
 * Workflow runs are logged by the harness as `tool-workflow/*` session events.
 * Each run has a name and a sequence of member steps (sub-agent invocations)
 * with per-step outcomes. The panel renders only when there are runs to show.
 */

import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import { useTheme } from "./theme.tsx";
import type { WorkflowRun } from "./types.ts";

interface WorkflowPanelProps {
  runs: WorkflowRun[];
}

const OUTCOME_MARK: Record<string, string> = {
  completed: "✓",
  failed: "✕",
  cancelled: "↷",
};

export const WorkflowPanel = memo(function WorkflowPanel({
  runs,
}: WorkflowPanelProps) {
  const theme = useTheme();
  if (runs.length === 0) return null;

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
        ⚒ workflow {runs.length}
      </text>
      {runs.map((run) => (
        <box key={run.runId} style={{ flexDirection: "column" }}>
          <text
            fg={run.ended ? theme.textMuted : theme.primary}
            attributes={run.ended ? undefined : TextAttributes.BOLD}
          >
            {run.ended ? "✓" : "→"} {run.name}
          </text>
          {run.members.map((member) => (
            <text
              key={member.seq}
              fg={
                member.outcome === "completed"
                  ? theme.textMuted
                  : member.outcome === "failed"
                    ? theme.error
                    : theme.text
              }
            >
              {"  "}
              {member.outcome
                ? OUTCOME_MARK[member.outcome]
                : "…"}{" "}
              {member.label}
              {member.phase ? ` (${member.phase})` : ""}
            </text>
          ))}
        </box>
      ))}
    </box>
  );
});
