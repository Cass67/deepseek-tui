/**
 * Persistent banner for the active goal.
 *
 * Goals are collaboration state logged by the harness as `goal/change`
 * session events (last one wins; `clear` removes the goal). While active, the
 * agent works toward the objective across bounded rounds.
 */

import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import { useTheme } from "./theme.tsx";
import type { GoalInfo } from "./types.ts";

interface GoalPanelProps {
  goal: GoalInfo;
}

const PHASE_LABEL: Record<GoalInfo["phase"], string> = {
  active: "● active",
  paused: "⏸ paused",
  blocked: "⛔ blocked",
  complete: "✓ complete",
};

export const GoalPanel = memo(function GoalPanel({ goal }: GoalPanelProps) {
  const theme = useTheme();
  const rounds =
    goal.maxGoalRounds > 0
      ? `round ${goal.roundsStarted}/${goal.maxGoalRounds}`
      : `round ${goal.roundsStarted}`;
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
        ◎ goal {PHASE_LABEL[goal.phase]} · {rounds}
      </text>
      <text fg={theme.text}>{goal.objective}</text>
    </box>
  );
});
