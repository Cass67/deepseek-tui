/** Pending interaction queue and structured user-question answers. */

import type {
  InteractionRequestedNotification,
  InteractionRespondResult,
} from "@deepseek-ai/dsh-sdk-client";

export type PendingInteraction = InteractionRequestedNotification;
export type QuestionInteraction = Extract<
  PendingInteraction,
  { kind: "question" }
>;
export type QuestionItem = QuestionInteraction["questions"][number];

export interface QuestionAnswer {
  answers: Array<{ id: string; selected: string[]; custom?: string }>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Narrow one SDK notification payload before retaining it in UI state. */
export function interactionRequest(
  value: unknown,
): PendingInteraction | undefined {
  const request = record(value);
  if (
    !request ||
    typeof request.requestId !== "string" ||
    typeof request.sessionId !== "string"
  )
    return undefined;
  if (request.kind === "approval") {
    if (
      typeof request.approvalId !== "string" ||
      typeof request.toolName !== "string"
    )
      return undefined;
    if (request.callId !== undefined && typeof request.callId !== "string")
      return undefined;
    if (request.reason !== undefined && typeof request.reason !== "string")
      return undefined;
    return request as unknown as Extract<
      PendingInteraction,
      { kind: "approval" }
    >;
  }
  if (request.kind !== "question" || !Array.isArray(request.questions))
    return undefined;
  const valid = request.questions.every((value) => {
    const question = record(value);
    if (
      !question ||
      typeof question.id !== "string" ||
      typeof question.question !== "string"
    )
      return false;
    if (question.detail !== undefined && typeof question.detail !== "string")
      return false;
    if (question.header !== undefined && typeof question.header !== "string")
      return false;
    if (
      question.multiSelect !== undefined &&
      typeof question.multiSelect !== "boolean"
    )
      return false;
    return (
      question.options === undefined ||
      (Array.isArray(question.options) &&
        question.options.every((value) => {
          const option = record(value);
          return (
            option !== undefined &&
            typeof option.label === "string" &&
            (option.description === undefined ||
              typeof option.description === "string")
          );
        }))
    );
  });
  return valid ? (request as unknown as QuestionInteraction) : undefined;
}

/** Append an unseen request while retaining server order. */
export function enqueueInteraction(
  pending: readonly PendingInteraction[],
  request: PendingInteraction,
): PendingInteraction[] {
  if (pending.some((candidate) => candidate.requestId === request.requestId))
    return [...pending];
  return [...pending, request];
}

/** Remove a request resolved locally or by another responder. */
export function resolveInteraction(
  pending: readonly PendingInteraction[],
  requestId: string,
): PendingInteraction[] {
  return pending.filter((candidate) => candidate.requestId !== requestId);
}

/** Apply one response receipt without discarding a request rejected as malformed. */
export function applyInteractionReceipt(
  pending: readonly PendingInteraction[],
  requestId: string,
  result: InteractionRespondResult,
): PendingInteraction[] {
  return result.accepted || result.reason === "not-pending"
    ? resolveInteraction(pending, requestId)
    : [...pending];
}

/** Parse comma-separated option labels plus optional custom text for one question. */
export function parseQuestionInput(
  question: QuestionItem,
  input: string,
): { id: string; selected: string[]; custom?: string } {
  const values = input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) throw new Error("Answer cannot be empty");

  const options = question.options ?? [];
  if (options.length === 0)
    return { id: question.id, selected: [], custom: input.trim() };

  const selected: string[] = [];
  const custom: string[] = [];
  for (const value of values) {
    const numericIndex = /^\d+$/.test(value) ? Number(value) - 1 : -1;
    const option =
      numericIndex >= 0 && numericIndex < options.length
        ? options[numericIndex]
        : options.find(
            (candidate) =>
              candidate.label.toLowerCase() === value.toLowerCase(),
          );
    if (option) {
      if (!selected.includes(option.label)) selected.push(option.label);
    } else {
      custom.push(value);
    }
  }
  if (!question.multiSelect && selected.length > 1) {
    throw new Error("Choose at most one listed option");
  }
  if (!question.multiSelect && selected.length === 1 && custom.length > 0) {
    throw new Error(
      "Choose one listed option or enter a custom answer, not both",
    );
  }
  if (selected.length === 0 && custom.length === 0)
    throw new Error("Answer cannot be empty");
  return {
    id: question.id,
    selected,
    ...(custom.length > 0 ? { custom: custom.join(", ") } : {}),
  };
}

/** Build the ordered batch answer required by Harness. */
export function buildQuestionAnswer(
  questions: readonly QuestionItem[],
  inputs: Readonly<Record<string, string>>,
): QuestionAnswer {
  return {
    answers: questions.map((question) =>
      parseQuestionInput(question, inputs[question.id] ?? ""),
    ),
  };
}
