/** Dedicated search field that does not mutate the chat composer draft. */

import type { TextareaRenderable } from "@opentui/core";
import { useCallback, useRef } from "react";
import { useTheme } from "./theme.tsx";

interface SearchInputProps {
  onSubmit: (query: string) => void;
}

export function SearchInput({ onSubmit }: SearchInputProps) {
  const theme = useTheme();
  const textareaRef = useRef<TextareaRenderable>(null);
  const submit = useCallback(() => {
    const query = textareaRef.current?.plainText.trim() ?? "";
    if (query) onSubmit(query);
  }, [onSubmit]);

  return (
    <box
      style={{
        width: "100%",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.primary,
        paddingX: 1,
        paddingY: 1,
      }}
    >
      <textarea
        ref={textareaRef}
        placeholder="search transcript..."
        width="100%"
        height={3}
        backgroundColor={theme.background}
        focusedBackgroundColor={theme.background}
        textColor={theme.text}
        cursorColor={theme.primary}
        placeholderColor={theme.textMuted}
        focused={true}
        onSubmit={submit}
        keyBindings={[
          { name: "return", action: "submit" },
          { name: "kpenter", action: "submit" },
          { name: "linefeed", action: "submit" },
        ]}
      />
    </box>
  );
}
