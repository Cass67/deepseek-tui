/**
 * Multi-line input with Enter to submit and Shift+Enter for a newline.
 */

import type {
  ClipboardService,
  KeyEvent,
  MouseEvent as OpenTUIMouseEvent,
  PasteEvent,
  TextareaRenderable,
} from "@opentui/core";
import type { ImageAttachmentRef } from "@deepseek-ai/dsh-sdk-client";
import { useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { pastedImagePath } from "./attachments.ts";
import {
  commandSuggestions,
  formatCommandSuggestions,
  type RuntimeCommandDefinition,
} from "./commands.ts";
import { useTheme } from "./theme.tsx";

interface InputBarProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  focused?: boolean;
  onFocusChange?: (focused: boolean) => void;
  placeholder?: string;
  visible?: boolean;
  attachments?: readonly ImageAttachmentRef[];
  queuedPromptCount?: number;
  clipboard: ClipboardService;
  onClipboardNotice: (message: string) => void;
  onAttachPath?: (path: string) => void;
  runtimeCommands?: readonly RuntimeCommandDefinition[];
}

export function InputBar({
  onSubmit,
  disabled,
  focused = true,
  onFocusChange,
  placeholder,
  visible = true,
  attachments = [],
  queuedPromptCount = 0,
  clipboard,
  onClipboardNotice,
  onAttachPath,
  runtimeCommands = [],
}: InputBarProps) {
  const theme = useTheme();
  const dimensions = useTerminalDimensions();
  const textareaRef = useRef<TextareaRenderable>(null);
  const lastClickRef = useRef<{ at: number; x: number; y: number } | undefined>(
    undefined,
  );
  const focusedRef = useRef(focused);
  const [value, setValue] = useState("");
  const suggestions = commandSuggestions(value, runtimeCommands);
  const formattedSuggestions = formatCommandSuggestions(
    suggestions,
    dimensions.width - 4,
  );
  const suggestionRows = formattedSuggestions
    ? formattedSuggestions.split("\n").length
    : 0;
  const compactLayout = dimensions.width < 30;
  const composerHeight =
    suggestions.length > 0 ? (dimensions.height < 30 ? 1 : 2) : 5;
  const suggestionFooterRows = compactLayout ? 0 : 1;
  const suggestionPadding = compactLayout ? 0 : 1;

  useEffect(() => {
    focusedRef.current = focused;
    onFocusChange?.(focused);
  }, [focused, onFocusChange]);

  const handleSubmit = useCallback(() => {
    const trimmed = textareaRef.current?.plainText.trim() ?? "";
    if ((!trimmed && attachments.length === 0) || disabled) return;
    onSubmit(trimmed);
    textareaRef.current?.setText("");
    setValue("");
  }, [attachments.length, disabled, onSubmit]);

  const handleContentChange = useCallback(() => {
    setValue(textareaRef.current?.plainText ?? "");
  }, []);

  const copySelection = useCallback(
    (announce: boolean) => {
      const selected = textareaRef.current?.getSelectedText() ?? "";
      if (!selected) return;
      void clipboard
        .writeText(selected, { destination: "best-available" })
        .then((result) => {
          if (!announce) return;
          onClipboardNotice(
            result.host.status === "written"
              ? "Copied composer selection."
              : "Composer copy could not be verified.",
          );
        })
        .catch((error) => {
          if (announce) {
            onClipboardNotice(
              `Composer copy failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        });
    },
    [clipboard, onClipboardNotice],
  );

  const pasteClipboard = useCallback(() => {
    const editor = textareaRef.current;
    if (!editor) return;
    const textBefore = editor.plainText;
    const focusedBefore = editor.focused;
    const cursorBefore = editor.cursorOffset;
    const selectionBefore = editor.getSelection();
    void clipboard
      .read({ preferredTypes: ["text/plain"] })
      .then((result) => {
        if (result.status !== "read") {
          onClipboardNotice(`Composer paste unavailable: ${result.status}.`);
          return;
        }
        const selection = editor.getSelection();
        const selectionChanged =
          selection?.start !== selectionBefore?.start ||
          selection?.end !== selectionBefore?.end;
        if (
          !focusedBefore ||
          !editor.focused ||
          !focusedRef.current ||
          textareaRef.current !== editor ||
          editor.plainText !== textBefore ||
          editor.cursorOffset !== cursorBefore ||
          selectionChanged
        ) {
          onClipboardNotice(
            "Paste cancelled because composer changed while reading clipboard.",
          );
          return;
        }
        const text = new TextDecoder().decode(result.representation.bytes);
        editor.insertText(text);
        setValue(editor.plainText);
      })
      .catch((error) => {
        onClipboardNotice(
          `Composer paste failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }, [clipboard, onClipboardNotice]);

  const handlePaste = useCallback(
    (event: PasteEvent) => {
      const path = pastedImagePath(new TextDecoder().decode(event.bytes));
      if (!path || !onAttachPath) return;
      event.preventDefault();
      event.stopPropagation();
      onAttachPath(path);
    },
    [onAttachPath],
  );

  const handleMouseDown = useCallback(
    (event: OpenTUIMouseEvent) => {
      if (event.button !== 0) return;
      const previous = lastClickRef.current;
      const now = performance.now();
      lastClickRef.current = { at: now, x: event.x, y: event.y };
      if (
        !previous ||
        now - previous.at > 500 ||
        Math.abs(previous.x - event.x) > 1 ||
        Math.abs(previous.y - event.y) > 1
      )
        return;

      lastClickRef.current = undefined;
      const editor = textareaRef.current;
      const text = editor?.plainText ?? "";
      let offset = editor?.cursorCharacterOffset;
      if (!editor || offset === undefined || text.length === 0) return;
      const isWord = (character: string): boolean =>
        /[\p{L}\p{N}_]/u.test(character);
      if (
        !isWord(text[offset] ?? "") &&
        offset > 0 &&
        isWord(text[offset - 1] ?? "")
      )
        offset -= 1;
      if (!isWord(text[offset] ?? "")) return;
      let start = offset;
      let end = offset + 1;
      while (start > 0 && isWord(text[start - 1] ?? "")) start -= 1;
      while (end < text.length && isWord(text[end] ?? "")) end += 1;
      editor.setSelection(start, end);
      copySelection(true);
    },
    [copySelection],
  );

  const handleKeyDown = useCallback(
    (event: KeyEvent) => {
      const commandModifier = event.super === true;
      const terminalSelectAll = event.ctrl && event.shift && event.name === "a";
      const terminalCopy =
        (event.ctrl && event.shift && event.name === "c") ||
        (event.ctrl && !event.shift && event.name === "insert") ||
        (event.ctrl && !event.shift && event.name === "y");
      const terminalPaste =
        (event.ctrl && event.shift && event.name === "v") ||
        (event.ctrl && !event.shift && event.name === "v") ||
        (event.shift && event.name === "insert");
      if ((commandModifier && event.name === "a") || terminalSelectAll) {
        event.preventDefault();
        event.stopPropagation();
        textareaRef.current?.selectAll();
        return;
      }
      if ((commandModifier && event.name === "c") || terminalCopy) {
        event.preventDefault();
        event.stopPropagation();
        copySelection(true);
        return;
      }
      if ((commandModifier && event.name === "v") || terminalPaste) {
        event.preventDefault();
        event.stopPropagation();
        pasteClipboard();
        return;
      }
      if (event.name !== "tab") return;
      const liveSuggestions = commandSuggestions(
        textareaRef.current?.plainText ?? value,
        runtimeCommands,
      );
      const command = liveSuggestions[0];
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      const completion = `/${command.name}${command.usage === `/${command.name}` ? "" : " "}`;
      textareaRef.current?.setText(completion);
      textareaRef.current?.gotoBufferEnd();
      setValue(completion);
    },
    [copySelection, pasteClipboard, runtimeCommands, value],
  );

  return (
    <box
      visible={visible}
      style={{
        flexDirection: "column",
        width: "100%",
        height:
          suggestions.length > 0
            ? 4 +
              composerHeight +
              suggestionRows +
              suggestionFooterRows +
              suggestionPadding +
              Number(queuedPromptCount > 0) +
              Number(attachments.length > 0)
            : undefined,
        border: true,
        borderStyle: "rounded",
        borderColor: disabled ? theme.border : theme.primary,
        paddingX: 1,
        paddingY: 1,
      }}
    >
      {queuedPromptCount > 0 && (
        <text key="queued-prompts" fg={theme.warning}>
          ◌ {queuedPromptCount} queued
        </text>
      )}
      {attachments.length > 0 && (
        <text key="attachments" fg={theme.secondary}>
          {dimensions.width < 60
            ? `▣ ${attachments.length} image${attachments.length === 1 ? "" : "s"}`
            : attachments
                .map(
                  (attachment) =>
                    `▣ ${attachment.name ?? "image"} (${attachment.width}×${attachment.height})`,
                )
                .join("  ")}
        </text>
      )}
      {suggestions.length > 0 && (
        <box
          key="command-suggestions"
          style={{ width: "100%", paddingBottom: suggestionPadding }}
        >
          <text fg={theme.textMuted}>
            {formattedSuggestions}
            {suggestionFooterRows > 0 ? "\nTab completes first match" : ""}
          </text>
        </box>
      )}
      <textarea
        key="composer-textarea"
        ref={textareaRef}
        placeholder={
          disabled
            ? (placeholder ?? "input unavailable...")
            : (placeholder ??
              "type a message... (Enter to send, Shift+Enter for newline)")
        }
        width="100%"
        height={composerHeight}
        backgroundColor={theme.background}
        focusedBackgroundColor={theme.background}
        textColor={theme.text}
        cursorColor={theme.primary}
        placeholderColor={theme.textMuted}
        wrapMode="word"
        focused={focused && !disabled}
        onContentChange={handleContentChange}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onPaste={handlePaste}
        onSubmit={handleSubmit}
        keyBindings={[
          { name: "return", action: "submit" },
          { name: "kpenter", action: "submit" },
          { name: "linefeed", action: "submit" },
          { name: "return", shift: true, action: "newline" },
          { name: "kpenter", shift: true, action: "newline" },
          { name: "linefeed", shift: true, action: "newline" },
        ]}
      />
    </box>
  );
}
