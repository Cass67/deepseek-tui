import { TextAttributes } from "@opentui/core";
import { useTheme } from "./theme.tsx";

export interface AuthPromptView {
  id: string;
  type: "text" | "secret" | "manual_code" | "select";
  message: string;
  placeholder?: string;
  options?: readonly { id: string; label: string; description?: string }[];
}

interface AuthOverlayProps {
  provider: string;
  lines: readonly string[];
  prompt?: AuthPromptView;
  input: string;
}

/** Provider authentication panel; secret/code values are rendered only as bullets. */
export function AuthOverlay({
  provider,
  lines,
  prompt,
  input,
}: AuthOverlayProps) {
  const theme = useTheme();
  const concealed = prompt?.type === "secret" || prompt?.type === "manual_code";
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
        Authenticate — {provider}
      </text>
      <scrollbox
        style={{ flexGrow: 1, width: "100%" }}
        stickyScroll={true}
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
      {prompt && prompt.type !== "select" && (
        // The label sits ABOVE the box and the box holds only the value.
        // Both inside, the growing scrollbox above squeezes this to a single
        // row and the two lines draw over each other -- typing a key showed
        // one bullet on top of the prompt text.
        <box style={{ flexDirection: "column", width: "100%", flexShrink: 0 }}>
          <text fg={theme.text}>{prompt.message}</text>
          <box
            style={{
              flexDirection: "column",
              width: "100%",
              flexShrink: 0,
              border: true,
              borderColor: theme.primary,
              paddingX: 1,
            }}
          >
            <text fg={input ? theme.text : theme.textMuted}>
              {input
                ? concealed
                  ? "•".repeat([...input].length)
                  : input
                : (prompt.placeholder ?? "type response...")}
            </text>
          </box>
        </box>
      )}
      <text fg={theme.textMuted}>
        {prompt
          ? "Enter submit  Backspace edit  Esc cancel"
          : "Waiting for provider…  Esc cancel"}
      </text>
    </box>
  );
}
