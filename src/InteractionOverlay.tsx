/** Approval and batched user-question interaction surfaces. */

import type { TextareaRenderable } from "@opentui/core";
import { TextAttributes } from "@opentui/core";
import { useCallback, useRef, useState } from "react";
import {
  buildQuestionAnswer,
  parseQuestionInput,
  type QuestionAnswer,
  type QuestionInteraction,
} from "./interactions.ts";
import { Picker } from "./Picker.tsx";
import { useTheme } from "./theme.tsx";

interface ApprovalOverlayProps {
  toolName: string;
  reason?: string;
  onRespond: (outcome: "allowed-once" | "rejected") => void;
}

export function ApprovalOverlay({
  toolName,
  reason,
  onRespond,
}: ApprovalOverlayProps) {
  return (
    <Picker
      title={`Approval required — ${toolName}`}
      options={[
        {
          value: "allowed-once",
          name: "Allow once",
          description: reason ?? "Permit this operation once",
        },
        {
          value: "rejected",
          name: "Reject",
          description: "Deny this operation",
        },
      ]}
      selectedValue="rejected"
      onSelect={(value) =>
        onRespond(value === "allowed-once" ? "allowed-once" : "rejected")
      }
    />
  );
}

interface QuestionOverlayProps {
  interaction: QuestionInteraction;
  onAnswer: (answer: QuestionAnswer) => void;
}

export function QuestionOverlay({
  interaction,
  onAnswer,
}: QuestionOverlayProps) {
  const theme = useTheme();
  const inputRef = useRef<TextareaRenderable>(null);
  const [index, setIndex] = useState(0);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const question = interaction.questions[index];

  const submit = useCallback(() => {
    if (!question) return;
    const input = inputRef.current?.plainText.trim() ?? "";
    try {
      parseQuestionInput(question, input);
      const nextInputs = { ...inputs, [question.id]: input };
      if (index + 1 === interaction.questions.length) {
        onAnswer(buildQuestionAnswer(interaction.questions, nextInputs));
        return;
      }
      setInputs(nextInputs);
      setIndex(index + 1);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [index, inputs, interaction.questions, onAnswer, question]);

  if (!question) return null;
  const optionLines = (question.options ?? []).map(
    (option, optionIndex) =>
      `${optionIndex + 1}. ${option.label}${option.description ? ` — ${option.description}` : ""}`,
  );
  const prompt = question.options?.length
    ? question.multiSelect
      ? "Enter one or more labels or numbers separated by commas; other text becomes a custom answer."
      : "Enter one label or number, or enter a custom answer."
    : "Enter your answer.";

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
        {question.header ?? "Question"} · {index + 1}/
        {interaction.questions.length}
      </text>
      <text fg={theme.text}>{question.question}</text>
      {question.detail && <text fg={theme.textMuted}>{question.detail}</text>}
      {optionLines.map((line) => (
        <text key={line} fg={theme.text}>
          {line}
        </text>
      ))}
      <text fg={theme.textMuted}>{prompt}</text>
      {error && <text fg={theme.error}>{error}</text>}
      <textarea
        key={question.id}
        ref={inputRef}
        width="100%"
        height={4}
        backgroundColor={theme.background}
        focusedBackgroundColor={theme.background}
        textColor={theme.text}
        cursorColor={theme.primary}
        placeholderColor={theme.textMuted}
        placeholder="answer..."
        focused={true}
        onSubmit={submit}
        keyBindings={[
          { name: "return", action: "submit" },
          { name: "kpenter", action: "submit" },
          { name: "linefeed", action: "submit" },
        ]}
      />
      <text fg={theme.textMuted}>
        Enter submit/next · Esc cancel entire question batch
      </text>
    </box>
  );
}
