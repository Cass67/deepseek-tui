/**
 * Side panels for delegated subagents and background jobs.
 *
 * Both are derived from the live session transcript: subagents from
 * `subagent`/`subagent_fork` tool calls, jobs from the latest `job_list`
 * tool result. Each panel renders only when it has items to show.
 */

import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import { useTheme } from "./theme.tsx";
import type { JobInfo, SubagentInfo } from "./types.ts";

interface ActivityPanelsProps {
  subagents: SubagentInfo[];
  jobs: JobInfo[];
}

const JOB_STATUS_MARK: Record<JobInfo["status"], string> = {
  running: "→",
  stopping: "…",
  completed: "✓",
  killed: "✕",
  failed: "✕",
};

export const ActivityPanels = memo(function ActivityPanels({
  subagents,
  jobs,
}: ActivityPanelsProps) {
  const theme = useTheme();
  const hasSubagents = subagents.length > 0;
  const hasJobs = jobs.length > 0;
  if (!hasSubagents && !hasJobs) return null;

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        gap: 1,
      }}
    >
      {hasSubagents && (
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
            ⑂ subagents {subagents.length}
          </text>
          {subagents.map((subagent) => (
            <text
              key={subagent.id}
              fg={
                subagent.status === "running" ? theme.primary : theme.textMuted
              }
              attributes={
                subagent.status === "running"
                  ? TextAttributes.BOLD
                  : undefined
              }
            >
              {subagent.status === "running" ? "→" : "✓"}{" "}
              {subagent.description || subagent.id}
            </text>
          ))}
        </box>
      )}
      {hasJobs && (
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
            ⚙ jobs {jobs.length}
          </text>
          {jobs.map((job) => (
            <text
              key={job.id}
              fg={
                job.status === "running" || job.status === "stopping"
                  ? theme.primary
                  : theme.textMuted
              }
              attributes={
                job.status === "running" || job.status === "stopping"
                  ? TextAttributes.BOLD
                  : undefined
              }
            >
              {JOB_STATUS_MARK[job.status]} {job.id} [{job.kind}] {job.label}
            </text>
          ))}
        </box>
      )}
    </box>
  );
});
