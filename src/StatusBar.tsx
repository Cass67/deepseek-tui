/** Top status bar: live activity, route, and token usage. */

import { TextAttributes } from "@opentui/core";
import { useEffect, useState } from "react";
import { useTheme } from "./theme.tsx";
import type { AgentStatus } from "./types.ts";

const SPINNER_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const;

interface StatusBarProps {
  status: AgentStatus;
  activity: string | null;
  activitySince: number | null;
  provider: string;
  model: string;
  reasoningEffort?: string;
  tokenUsage: { input: number; output: number };
}

function elapsedLabel(since: number | null, now: number): string {
  if (since === null) return "";
  const seconds = Math.max(0, Math.floor((now - since) / 1_000));
  return seconds < 1 ? "" : ` · ${seconds}s`;
}

export function StatusBar({
  status,
  activity,
  activitySince,
  provider,
  model,
  reasoningEffort,
  tokenUsage,
}: StatusBarProps) {
  const theme = useTheme();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status !== "running" && status !== "connecting" && activity === null)
      return;
    const timer = setInterval(() => setTick((value) => value + 1), 80);
    return () => clearInterval(timer);
  }, [activity, status]);

  const color: Record<AgentStatus, string> = {
    connecting: theme.warning,
    running: theme.info,
    idle: theme.success,
    error: theme.error,
  };
  const active =
    status === "running" || status === "connecting" || activity !== null;
  const frame = SPINNER_FRAMES[tick % SPINNER_FRAMES.length] ?? "⠋";
  const label = active
    ? `${frame} ${activity ?? (status === "connecting" ? "connecting" : "working")}${elapsedLabel(activitySince, Date.now())}`
    : status === "idle"
      ? "● ready"
      : "● error";

  return (
    <box
      style={{
        flexDirection: "row",
        width: "100%",
        flexShrink: 0,
        paddingX: 2,
        paddingY: 1,
        backgroundColor: theme.background,
        justifyContent: "space-between",
      }}
    >
      <text fg={color[status]} attributes={TextAttributes.BOLD}>
        {label}
      </text>
      <text fg={theme.textMuted}>
        {provider}/{model}
        {reasoningEffort ? ` · ${reasoningEffort}` : ""}
      </text>
      <text fg={theme.textMuted}>
        {tokenUsage.input + tokenUsage.output > 0
          ? `${tokenUsage.input}↑ ${tokenUsage.output}↓ tokens`
          : ""}
      </text>
    </box>
  );
}
