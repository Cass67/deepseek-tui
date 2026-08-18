/**
 * Persistent banner shown while the agent is in plan mode.
 *
 * Plan mode is collaboration state logged by the harness as `plan/mode`
 * session events (last one wins). While active, the agent plans instead of
 * acting and presents a completed plan via `exit_plan_mode` for review.
 */

import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import { useTheme } from "./theme.tsx";

export const PlanBanner = memo(function PlanBanner() {
  const theme = useTheme();
  return (
    <box
      style={{
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        backgroundColor: theme.warning,
        paddingX: 2,
        paddingY: 1,
      }}
    >
      <text fg={theme.background} attributes={TextAttributes.BOLD}>
        ⏸ PLAN MODE
      </text>
      <text fg={theme.background}>
        {"  "}agent is planning — it will present a plan for your review before
        acting. /plan off to exit early.
      </text>
    </box>
  );
});
