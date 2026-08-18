/** Durable session presentation and route reconstruction. */

import type {
  ModelCatalogResult,
  SessionHistoryEvent,
  SessionListEntry,
} from "@deepseek-ai/dsh-sdk-client";

export interface SessionPresentation {
  title: string;
  provider?: string;
  model?: string;
  reasoningEffort?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Read latest logged title and model route from exact durable history. */
export function sessionPresentation(
  events: readonly SessionHistoryEvent[],
): SessionPresentation {
  let title: string | undefined;
  let headerProvider: string | undefined;
  let headerModel: string | undefined;
  let headerReasoningEffort: string | undefined;
  let contextProvider: string | undefined;
  let contextModel: string | undefined;
  for (const event of events) {
    if (event.type === "session/title") {
      const candidate = record(event.data)?.title;
      if (typeof candidate === "string" && candidate.trim())
        title = candidate.trim();
    }
    if (event.type === "request/header") {
      const config = record(record(record(event.data)?.header)?.config);
      if (
        typeof config?.provider === "string" &&
        typeof config.model === "string"
      ) {
        headerProvider = config.provider;
        headerModel = config.model;
        headerReasoningEffort =
          typeof config.reasoningEffort === "string"
            ? config.reasoningEffort
            : undefined;
      }
    } else if (event.type === "request/context") {
      const data = record(event.data);
      if (
        typeof data?.provider === "string" &&
        typeof data.model === "string"
      ) {
        contextProvider = data.provider;
        contextModel = data.model;
      }
    }
  }
  return {
    title: title ?? "Untitled session",
    provider: headerProvider ?? contextProvider,
    model: headerModel ?? contextModel,
    reasoningEffort: headerReasoningEffort,
  };
}

/** Return reconstructed route only when current catalog still advertises it. */
export function catalogRoute(
  presentation: SessionPresentation,
  catalog: ModelCatalogResult,
): { provider: string; model: string; reasoningEffort?: string } | undefined {
  if (!presentation.provider || !presentation.model) return undefined;
  const provider = catalog.providers.find(
    (candidate) => candidate.id === presentation.provider,
  );
  const model = provider?.models.find(
    (candidate) => candidate.id === presentation.model,
  );
  if (!model) return undefined;
  return {
    provider: presentation.provider,
    model: presentation.model,
    ...(presentation.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: presentation.reasoningEffort }),
  };
}

/** Stable newest-first session picker text. */
export function sessionPickerDescription(entry: SessionListEntry): string {
  const date = new Date(entry.header.createdAt);
  const timestamp = Number.isNaN(date.valueOf())
    ? String(entry.header.createdAt)
    : date.toLocaleString();
  return `${entry.live ? "live" : entry.persisted ? "saved" : "unavailable"} · ${timestamp}`;
}
