/** Compact tool activity display; successful output stays collapsed. */

import { TextAttributes } from "@opentui/core";
import { memo } from "react";
import { useTheme } from "./theme.tsx";

interface ToolCardProps {
  name: string;
  args: string;
  result?: string;
  running?: boolean;
  failed?: boolean;
}

/** Human-sized detail for common tool arguments. */
export function toolSummary(name: string, args: string): string {
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    if (typeof parsed.description === "string" && parsed.description.trim())
      return parsed.description.trim();
    if (typeof parsed.file_path === "string") return parsed.file_path;
    if (typeof parsed.path === "string") return parsed.path;
    if (typeof parsed.command === "string")
      return parsed.command.split("\n")[0] ?? parsed.command;
  } catch {
    // Tool arguments can be incomplete while streaming; fall back to raw text.
  }
  return args;
}

export const ToolCard = memo(function ToolCard({
  name,
  args,
  result,
  running,
  failed,
}: ToolCardProps) {
  const theme = useTheme();
  const color = running
    ? theme.warning
    : failed
      ? theme.error
      : theme.textMuted;
  const icon = running ? "◌" : failed ? "✗" : "✓";
  const summary = truncate(toolSummary(name, args), 160);
  const failure = failed
    ? truncate(result || "Tool failed without output.", 500)
    : undefined;

  return (
    <box style={{ flexDirection: "column", width: "100%", paddingX: 2 }}>
      <text
        fg={color}
        attributes={
          running || failed ? TextAttributes.BOLD : TextAttributes.DIM
        }
      >
        {icon} {name}
        {summary ? ` · ${summary}` : ""}
      </text>
      {failure && <text fg={theme.error}>{failure}</text>}
    </box>
  );
});

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `… (${text.length - maxLen} more chars)`;
}
