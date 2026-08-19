import { useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";
import type {
  SettingsGetResult,
  SettingsNamespaceWire,
} from "@deepseek-ai/dsh-sdk-client";
import { useTheme } from "./theme.tsx";

interface SettingsOverlayProps {
  getSettings: () => Promise<SettingsGetResult>;
  model: string;
  reasoning: string;
  showReasoning: boolean;
  themeName: string;
  session: string;
}

/** Render a settings value on one line, falling back to a stable string. */
function formatValue(value: unknown): string {
  if (value === undefined) return "(unset)";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Full-height settings panel. Shows the active model/reasoning/theme/session
 * plus every registered settings namespace (fetched live over L2), and the
 * key shortcuts. Never enters model-visible history.
 */
export function SettingsOverlay({
  getSettings,
  model,
  reasoning,
  showReasoning,
  themeName,
  session,
}: SettingsOverlayProps) {
  const theme = useTheme();
  const [namespaces, setNamespaces] = useState<SettingsNamespaceWire[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((result) => {
        if (!cancelled) setNamespaces(result.namespaces);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [getSettings]);

  const lines: string[] = [
    `Model:      ${model}`,
    `Reasoning:  ${reasoning}`,
    `Thinking:   ${showReasoning ? "shown" : "hidden"} (/thinking)`,
    `Theme:      ${themeName}`,
    `Session:    ${session}`,
    "",
  ];

  if (error !== null) {
    lines.push(`Settings:  (error: ${error})`);
  } else if (namespaces === null) {
    lines.push("Settings:  loading…");
  } else if (namespaces.length === 0) {
    lines.push("Settings:  (no namespaces registered)");
  } else {
    lines.push("Settings namespaces:");
    for (const ns of namespaces) {
      lines.push(`  ${ns.ns}  [rev ${ns.revision}, ${ns.applies}]`);
      lines.push(`    ${formatValue(ns.value)}`);
    }
  }

  lines.push("");
  lines.push("Shortcuts:");
  lines.push("  Ctrl+L  switch model");
  lines.push("  Ctrl+T  reasoning effort");
  lines.push("  Ctrl+P  switch provider");
  lines.push("  Ctrl+R  resume session");
  lines.push("  Ctrl+K  skill picker");
  lines.push("  Ctrl+A  agent preset picker");
  lines.push("  Ctrl+D  directory picker");
  lines.push("  Ctrl+Y  trajectory view");
  lines.push("  Ctrl+S  this panel");
  lines.push("  Esc     close");

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        width: "100%",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.primary,
        paddingX: 2,
        paddingY: 1,
        gap: 1,
      }}
    >
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
        Settings
      </text>
      <scrollbox
        style={{ flexGrow: 1, width: "100%" }}
        focused={true}
        stickyScroll={false}
        viewportCulling={false}
      >
        <box style={{ flexDirection: "column", width: "100%" }}>
          {lines.map((line, index) => (
            <text key={`${index}-${line}`} fg={theme.text}>
              {line}
            </text>
          ))}
        </box>
      </scrollbox>
      <text fg={theme.textMuted}>Esc to close</text>
    </box>
  );
}
