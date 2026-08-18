import { TextAttributes } from "@opentui/core";
import { useTheme } from "./theme.tsx";

interface ControlOverlayProps {
  title: string;
  lines: readonly string[];
  footer?: string;
}

/** Full-height local panel that never enters model-visible history. */
export function ControlOverlay({
  title,
  lines,
  footer = "Esc to close",
}: ControlOverlayProps) {
  const theme = useTheme();
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
        {title}
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
      <text fg={theme.textMuted}>{footer}</text>
    </box>
  );
}
