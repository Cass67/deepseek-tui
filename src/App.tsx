/** Main OpenTUI application and local command dispatcher. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, usePaste, useRenderer } from "@opentui/react";
import type {
  CommandDescriptor,
  CommandExecuteResult,
  ModelCatalogReasoningEffort,
  ModelCatalogResult,
  ProviderAuthInfoResult,
  HarnessNotification,
} from "@deepseek-ai/dsh-sdk-client";
import { AuthOverlay, type AuthPromptView } from "./AuthOverlay.tsx";
import { ChatView } from "./ChatView.tsx";
import {
  clipboardResultMessage,
  createRendererClipboard,
} from "./clipboard.ts";
import { COMMANDS, parseInput } from "./commands.ts";
import { ControlOverlay } from "./ControlOverlay.tsx";
import { InputBar } from "./InputBar.tsx";
import { ApprovalOverlay, QuestionOverlay } from "./InteractionOverlay.tsx";
import { Picker } from "./Picker.tsx";
import { openExternalUrl } from "./openExternal.ts";
import { PlanBanner } from "./PlanBanner.tsx";
import { ActivityPanels } from "./ActivityPanels.tsx";
import { GoalPanel } from "./GoalPanel.tsx";
import { WorkflowPanel } from "./WorkflowPanel.tsx";
import { loadThemePreference, saveThemePreference } from "./preferences.ts";
import { SearchInput } from "./SearchInput.tsx";
import { formatShellResult, ShellRunner } from "./shell.ts";
import { StatusBar } from "./StatusBar.tsx";
import { registerShutdown, requestShutdown } from "./shutdown.ts";
import { THEMES, ThemeProvider, useTheme, type ThemeName } from "./theme.tsx";
import {
  searchTranscript,
  serializeTranscript,
  withStreamingText,
} from "./transcript.ts";
import { useHarness } from "./useHarness.ts";
import type { SessionChoice } from "./useHarness.ts";

const MAX_SEARCH_RESULTS = 100;

interface ModelChoice {
  key: string;
  provider: string;
  model: string;
  name: string;
  description: string;
}

function modelChoices(
  catalog: ModelCatalogResult,
  providerIds: ReadonlySet<string>,
): readonly ModelChoice[] {
  return catalog.providers.flatMap((provider) =>
    providerIds.has(provider.id)
      ? provider.models.map((model) => ({
          key: JSON.stringify([provider.id, model.id]),
          provider: provider.id,
          model: model.id,
          name: `${model.name} — ${provider.name}`,
          description: `${provider.id}/${model.id}${model.description ? ` • ${model.description}` : ""}`,
        }))
      : [],
  );
}

type Overlay =
  | { kind: "none" }
  | { kind: "panel"; title: string; lines: readonly string[]; footer?: string }
  | { kind: "search-entry" }
  | { kind: "providers"; catalog: ModelCatalogResult }
  | {
      kind: "provider-actions";
      catalog: ModelCatalogResult;
      provider: string;
      info: ProviderAuthInfoResult;
    }
  | {
      kind: "auth";
      catalog: ModelCatalogResult;
      provider: string;
      flowId?: string;
      lines: readonly string[];
      prompt?: AuthPromptView;
      input: string;
    }
  | { kind: "models"; choices: readonly ModelChoice[] }
  | {
      kind: "reasoning";
      efforts: readonly ModelCatalogReasoningEffort[];
      defaultEffort?: string;
    }
  | { kind: "sessions"; sessions: readonly SessionChoice[] }
  | { kind: "themes" }
  | { kind: "settings" };

export function App() {
  const [themeName, setThemeName] = useState<ThemeName>(loadThemePreference);
  return (
    <ThemeProvider name={themeName}>
      <AppBody themeName={themeName} onThemeChange={setThemeName} />
    </ThemeProvider>
  );
}

interface AppBodyProps {
  themeName: ThemeName;
  onThemeChange: (name: ThemeName) => void;
}

function AppBody({ themeName, onThemeChange }: AppBodyProps) {
  const renderer = useRenderer();
  const clipboard = useMemo(
    () => createRendererClipboard(renderer),
    [renderer],
  );
  const shellRunner = useMemo(() => new ShellRunner(), []);
  const theme = useTheme();
  const harness = useHarness();
  const { state, notify } = harness;
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const [quitting, setQuitting] = useState(false);
  const [shellRunning, setShellRunning] = useState(false);
  const [runtimeCommands, setRuntimeCommands] = useState<
    readonly CommandDescriptor[]
  >([]);
  const modelPickerRequestRef = useRef(0);

  useEffect(() => {
    if (state.status !== "idle") return;
    let active = true;
    void harness
      .listCommands()
      .then((result) => {
        if (active) setRuntimeCommands(result.available ? result.commands : []);
      })
      .catch(() => {
        if (active) setRuntimeCommands([]);
      });
    return () => {
      active = false;
    };
  }, [harness.listCommands, state.sessionId, state.status]);

  const shutdown = useCallback(async () => {
    const results = await Promise.allSettled([
      shellRunner.shutdown(),
      harness.shutdown(),
      clipboard.dispose(),
    ]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }, [clipboard, harness.shutdown, shellRunner]);

  useEffect(() => registerShutdown(shutdown), [shutdown]);
  useEffect(
    () => () => {
      void clipboard.dispose();
    },
    [clipboard],
  );

  const reportError = useCallback(
    (error: unknown) => {
      notify(error instanceof Error ? error.message : String(error));
    },
    [notify],
  );

  const quit = useCallback(async () => {
    if (quitting) return;
    setQuitting(true);
    try {
      await requestShutdown();
    } finally {
      renderer.destroy();
    }
  }, [quitting, renderer]);

  const loadCatalog = useCallback(async (): Promise<
    ModelCatalogResult | undefined
  > => {
    try {
      const result = await harness.catalog();
      for (const failure of result.failures)
        notify(`${failure.name}: ${failure.message}`);
      return result;
    } catch (error) {
      reportError(error);
      return undefined;
    }
  }, [harness, notify, reportError]);

  const openProviderPicker = useCallback(async () => {
    const catalog = await loadCatalog();
    if (catalog) setOverlay({ kind: "providers", catalog });
  }, [loadCatalog]);

  const openProviderActions = useCallback(
    async (provider: string, catalog: ModelCatalogResult) => {
      setOverlay({
        kind: "panel",
        title: `Provider — ${provider}`,
        lines: ["Checking authentication..."],
      });
      try {
        const info = await harness.providerAuthInfo(provider);
        setOverlay({ kind: "provider-actions", catalog, provider, info });
      } catch (error) {
        reportError(error);
        setOverlay({ kind: "none" });
      }
    },
    [harness, reportError],
  );

  const finishProviderAuth = useCallback(
    async (provider: string) => {
      try {
        await harness.providerAuthInfo(provider);
        const catalog = await loadCatalog();
        if (catalog)
          setOverlay({
            kind: "models",
            choices: modelChoices(catalog, new Set([provider])),
          });
      } catch (error) {
        reportError(error);
        setOverlay({ kind: "none" });
      }
    },
    [harness, loadCatalog, reportError],
  );

  const handleAuthNotification = useCallback(
    (notification: HarnessNotification) => {
      const flowId = String(notification.params.flowId);
      setOverlay((current) => {
        if (
          current.kind !== "auth" ||
          (current.flowId !== undefined && current.flowId !== flowId)
        )
          return current;
        const correlated = { ...current, flowId: current.flowId ?? flowId };
        if (notification.method === "provider.auth.promptResolved") {
          return current.prompt?.id === notification.params.promptId
            ? { ...correlated, prompt: undefined, input: "" }
            : current;
        }
        if (notification.method === "provider.auth.prompt") {
          return {
            ...correlated,
            prompt: {
              ...(notification.params.prompt as unknown as AuthPromptView),
              id: String(notification.params.promptId),
            },
            input: "",
          };
        }
        if (notification.method === "provider.auth.event") {
          const event = notification.params.event as Record<string, unknown>;
          const lines = [...current.lines];
          if (event.type === "auth_url") {
            lines.push(
              String(event.instructions ?? "Complete sign-in in your browser."),
              String(event.url),
            );
            void openExternalUrl(String(event.url)).catch(reportError);
          } else if (event.type === "device_code") {
            lines.push(
              `Device code: ${String(event.userCode)}`,
              `Open: ${String(event.verificationUri)}`,
            );
            void openExternalUrl(String(event.verificationUri)).catch(
              reportError,
            );
          } else if (event.type === "info") {
            lines.push(String(event.message));
            if (Array.isArray(event.links))
              for (const link of event.links) {
                if (
                  typeof link === "object" &&
                  link !== null &&
                  typeof (link as Record<string, unknown>).url === "string"
                ) {
                  const url = String((link as Record<string, unknown>).url);
                  lines.push(url);
                  void openExternalUrl(url).catch(reportError);
                }
              }
          } else if (event.type === "progress")
            lines.push(String(event.message));
          return { ...correlated, lines };
        }
        if (notification.method === "provider.auth.finished") {
          const outcome = notification.params.outcome;
          if (outcome === "success") {
            void finishProviderAuth(current.provider);
            return {
              ...correlated,
              prompt: undefined,
              input: "",
              lines: [...current.lines, "Authentication complete."],
            };
          }
          const message =
            outcome === "cancelled"
              ? "Authentication cancelled."
              : "Provider authentication failed.";
          return {
            ...correlated,
            prompt: undefined,
            input: "",
            lines: [...current.lines, message],
          };
        }
        return current;
      });
    },
    [finishProviderAuth, reportError],
  );

  const startProviderAuth = useCallback(
    async (
      provider: string,
      type: "api_key" | "oauth",
      catalog: ModelCatalogResult,
    ) => {
      setOverlay({
        kind: "auth",
        catalog,
        provider,
        lines: ["Starting provider authentication..."],
        input: "",
      });
      try {
        const flowId = await harness.startProviderAuth(
          provider,
          type,
          handleAuthNotification,
        );
        const current = overlayRef.current;
        if (current.kind !== "auth" || current.provider !== provider) {
          await harness.cancelProviderAuth(flowId);
          return;
        }
        setOverlay({ ...current, flowId });
      } catch (error) {
        reportError(error);
        setOverlay({
          kind: "provider-actions",
          catalog,
          provider,
          info: await harness.providerAuthInfo(provider),
        });
      }
    },
    [handleAuthNotification, harness, reportError],
  );

  const openSessionPicker = useCallback(async () => {
    try {
      setOverlay({
        kind: "panel",
        title: "Sessions",
        lines: ["Loading durable sessions..."],
      });
      setOverlay({ kind: "sessions", sessions: await harness.listSessions() });
    } catch (error) {
      reportError(error);
      setOverlay({ kind: "none" });
    }
  }, [harness, reportError]);

  const openReasoningPicker = useCallback(async () => {
    const catalog = await loadCatalog();
    const model = catalog?.providers
      .find((provider) => provider.id === state.provider)
      ?.models.find((candidate) => candidate.id === state.model);
    if (!model?.reasoning) {
      notify(
        `${state.provider}/${state.model} exposes no selectable reasoning levels.`,
      );
      return;
    }
    setOverlay({
      kind: "reasoning",
      efforts: model.reasoning.efforts,
      defaultEffort: model.reasoning.defaultEffort,
    });
  }, [loadCatalog, notify, state.model, state.provider]);

  const selectReasoning = useCallback(
    async (level: string) => {
      await harness.selectReasoning(level);
      setOverlay({ kind: "none" });
    },
    [harness],
  );

  const openModelPicker = useCallback(async () => {
    const request = ++modelPickerRequestRef.current;
    setOverlay({
      kind: "panel",
      title: "Models",
      lines: ["Loading authenticated provider models..."],
    });
    const catalog = await loadCatalog();
    if (!catalog || request !== modelPickerRequestRef.current) return;
    const results = await Promise.allSettled(
      catalog.providers.map(async (provider) => ({
        provider: provider.id,
        configured: (await harness.providerAuthInfo(provider.id)).configured,
      })),
    );
    if (
      request !== modelPickerRequestRef.current ||
      overlayRef.current.kind !== "panel" ||
      overlayRef.current.title !== "Models"
    )
      return;
    const authenticated = new Set(
      results.flatMap((result) =>
        result.status === "fulfilled" && result.value.configured
          ? [result.value.provider]
          : [],
      ),
    );
    const choices = modelChoices(catalog, authenticated);
    if (choices.length === 0) {
      setOverlay({
        kind: "panel",
        title: "Models",
        lines: [
          "No authenticated providers with models.",
          "Use /provider to authenticate one.",
        ],
      });
      return;
    }
    setOverlay({ kind: "models", choices });
  }, [harness, loadCatalog]);

  const showHelp = useCallback(async () => {
    const lines = COMMANDS.map(
      (command) => `${command.usage.padEnd(24)} ${command.description}`,
    );
    setOverlay({ kind: "panel", title: "Help", lines: [...lines] });
    try {
      const runtime = await harness.listCommands();
      setRuntimeCommands(runtime.available ? runtime.commands : []);
      const localNames = new Set<string>(
        COMMANDS.map((command) => command.name),
      );
      for (const command of runtime.commands) {
        if (!localNames.has(command.name)) {
          lines.push(
            `/${command.name}${command.input ? ` ${command.input.hint}` : ""}`.padEnd(
              24,
            ) + ` ${command.description}`,
          );
        }
      }
    } catch (error) {
      lines.push(
        `Runtime commands unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    lines.push(
      "",
      "Enter send  Shift+Enter newline  Tab complete",
      "Esc reject/cancel/close  Ctrl+F search  Ctrl+R sessions",
      "Ctrl+L models  Ctrl+P providers  Ctrl+T reasoning  Ctrl+C quit",
    );
    setOverlay((current) =>
      current.kind === "panel" && current.title === "Help"
        ? { kind: "panel", title: "Help", lines }
        : current,
    );
  }, [harness]);

  const showStatus = useCallback(() => {
    setOverlay({
      kind: "panel",
      title: "Session status",
      lines: [
        `status:   ${state.status}`,
        `session:  ${state.sessionId}`,
        `provider: ${state.provider}`,
        `model:    ${state.model}`,
        `reason:   ${state.reasoningEffort ?? "provider default"}`,
        `theme:    ${themeName}`,
        `shell:    ${shellRunning ? "running" : "idle"}`,
        `images:   ${state.pendingAttachments.length} queued`,
        `queue:    ${state.queuedPromptCount} prompts`,
        `actions:  ${state.pendingInteractions.length} pending`,
        `tokens:   ${state.tokenUsage.input} in / ${state.tokenUsage.output} out`,
      ],
    });
  }, [shellRunning, state, themeName]);

  const showSearch = useCallback(
    (query: string) => {
      const messages = withStreamingText(
        state.messages,
        state.currentStreamingText,
      );
      const hits = searchTranscript(messages, query);
      const shown = hits.slice(0, MAX_SEARCH_RESULTS);
      setOverlay({
        kind: "panel",
        title: `Search — ${query}`,
        lines:
          shown.length === 0
            ? ["No transcript matches."]
            : shown.map(
                (hit, index) => `${index + 1}. [${hit.label}] ${hit.preview}`,
              ),
        footer:
          hits.length > shown.length
            ? `Showing ${shown.length} of ${hits.length} matches  •  ↑/↓ scroll  •  Esc close`
            : `${shown.length} match${shown.length === 1 ? "" : "es"}  •  ↑/↓ scroll  •  Esc close`,
      });
    },
    [state.currentStreamingText, state.messages],
  );

  const copyTranscript = useCallback(
    async (mode: "all" | "last") => {
      const messages = withStreamingText(
        state.messages,
        state.currentStreamingText,
      );
      const text = serializeTranscript(messages, mode);
      if (!text) {
        notify("Nothing to copy.");
        return;
      }
      const result = await clipboard.writeText(text, {
        destination: "best-available",
      });
      notify(
        clipboardResultMessage(
          result,
          mode === "all" ? "transcript" : "latest message",
        ),
      );
    },
    [clipboard, notify, state.currentStreamingText, state.messages],
  );

  const executeShell = useCallback(
    async (command: string) => {
      if (!command) {
        notify("Usage: /shell <command> or !command");
        return;
      }
      if (shellRunner.running) {
        notify("A shell command is already running.");
        return;
      }
      try {
        setShellRunning(true);
        notify(`$ ${command}\nrunning...`);
        const result = await shellRunner.run(
          command,
          process.env.DSH_CWD ?? process.cwd(),
        );
        notify(formatShellResult(result));
      } catch (error) {
        reportError(error);
      } finally {
        setShellRunning(shellRunner.running);
      }
    },
    [notify, reportError, shellRunner],
  );

  const cancelShell = useCallback(async () => {
    try {
      await shellRunner.cancel("user");
    } catch (error) {
      reportError(error);
    } finally {
      setShellRunning(shellRunner.running);
    }
  }, [reportError, shellRunner]);

  const selectTheme = useCallback(
    (name: string) => {
      const selected = THEMES.find((candidate) => candidate.id === name);
      if (!selected) {
        notify(`Unknown theme: ${name}`);
        return;
      }
      onThemeChange(selected.id);
      setOverlay({ kind: "none" });
      try {
        saveThemePreference(selected.id);
        notify(`Theme: ${selected.name}`);
      } catch (error) {
        notify(
          `Theme changed, but preference could not be saved: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [notify, onThemeChange],
  );

  const showCommandResult = useCallback(
    (line: string, result: CommandExecuteResult) => {
      switch (result.outcome) {
        case "success":
          notify(result.text ?? `${line} completed`);
          break;
        case "error":
        case "unavailable":
        case "unknown-command":
          notify(result.message);
          break;
      }
    },
    [notify],
  );

  const handleCommand = useCallback(
    async (name: string, args: string, line: string) => {
      try {
        switch (name) {
          case "help":
            await showHelp();
            return;
          case "status":
            showStatus();
            return;
          case "model":
            if (args) await harness.selectModel(state.provider, args);
            else await openModelPicker();
            return;
          case "models":
            await openModelPicker();
            return;
          case "provider": {
            if (!args) {
              await openProviderPicker();
              return;
            }
            const catalog = await loadCatalog();
            if (catalog) await openProviderActions(args, catalog);
            return;
          }
          case "reasoning":
            if (args) await selectReasoning(args);
            else await openReasoningPicker();
            return;
          case "new":
            await harness.newSession();
            return;
          case "sessions":
            await openSessionPicker();
            return;
          case "attach":
            await harness.addAttachment(args);
            return;
          case "unattach":
            harness.clearAttachments();
            notify("Queued attachments cleared");
            return;
          case "clear":
            harness.clearView();
            return;
          case "cancel":
            if (shellRunner.running) await cancelShell();
            else await harness.cancel();
            return;
          case "search":
            if (args) showSearch(args);
            else setOverlay({ kind: "search-entry" });
            return;
          case "copy":
            if (args && args !== "last" && args !== "all") {
              notify("Usage: /copy [last|all]");
              return;
            }
            await copyTranscript(args === "all" ? "all" : "last");
            return;
          case "shell":
            await executeShell(args);
            return;
          case "theme":
            if (args) selectTheme(args);
            else setOverlay({ kind: "themes" });
            return;
          case "quit":
            await quit();
            return;
          case "compact":
          default:
            showCommandResult(line, await harness.executeCommand(line));
        }
      } catch (error) {
        reportError(error);
      }
    },
    [
      cancelShell,
      copyTranscript,
      executeShell,
      harness,
      loadCatalog,
      notify,
      openModelPicker,
      openProviderActions,
      openProviderPicker,
      openReasoningPicker,
      openSessionPicker,
      quit,
      reportError,
      selectReasoning,
      selectTheme,
      showCommandResult,
      showHelp,
      showSearch,
      showStatus,
      shellRunner,
      state.provider,
    ],
  );

  const handleSubmit = useCallback(
    (text: string) => {
      const parsed = parseInput(text);
      if (parsed.kind === "message") void harness.sendMessage(parsed.text);
      else if (parsed.kind === "shell") void executeShell(parsed.command);
      else void handleCommand(parsed.name, parsed.args, parsed.line);
    },
    [executeShell, handleCommand, harness],
  );

  const activeInteraction = state.pendingInteractions[0];
  const rejectActiveInteraction = useCallback(() => {
    if (!activeInteraction) return;
    const response =
      activeInteraction.kind === "approval"
        ? harness.respondApproval(activeInteraction.requestId, "rejected")
        : harness.cancelQuestion(activeInteraction.requestId);
    void response.catch(reportError);
  }, [activeInteraction, harness, reportError]);

  usePaste((event) => {
    if (
      overlay.kind !== "auth" ||
      !overlay.prompt ||
      overlay.prompt.type === "select"
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const pasted = new TextDecoder()
      .decode(event.bytes)
      .replace(/[\r\n]+$/, "");
    if (pasted) setOverlay({ ...overlay, input: overlay.input + pasted });
  });

  useKeyboard((key) => {
    if (overlay.kind === "auth") {
      if (key.name === "escape") {
        key.preventDefault();
        key.stopPropagation();
        if (overlay.flowId)
          void harness.cancelProviderAuth(overlay.flowId).catch(reportError);
        setOverlay({ kind: "none" });
        return;
      }
      // Select prompts are rendered by Picker, which must receive arrows and
      // Enter. Capturing those keys here makes provider method choices inert.
      if (overlay.prompt?.type === "select") return;
      key.preventDefault();
      key.stopPropagation();
      if (!overlay.prompt) return;
      if (
        key.name === "return" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        if (!overlay.flowId || !overlay.input) return;
        const { flowId, prompt, input } = overlay;
        setOverlay({
          ...overlay,
          prompt: undefined,
          input: "",
          lines: [...overlay.lines, "Response submitted."],
        });
        void harness
          .respondProviderAuth(flowId, prompt.id, input)
          .then((accepted) => {
            if (!accepted) notify("Authentication prompt already resolved.");
          })
          .catch(reportError);
        return;
      }
      if (key.name === "backspace") {
        setOverlay({
          ...overlay,
          input: [...overlay.input].slice(0, -1).join(""),
        });
        return;
      }
      if (
        !key.ctrl &&
        !key.meta &&
        !key.super &&
        key.sequence &&
        [...key.sequence].length === 1
      ) {
        setOverlay({ ...overlay, input: overlay.input + key.sequence });
      }
      return;
    }
    if (key.name === "escape") {
      if (activeInteraction) rejectActiveInteraction();
      else if (shellRunning) void cancelShell();
      else if (overlay.kind !== "none") setOverlay({ kind: "none" });
      else if (state.status === "running")
        void harness.cancel().catch(reportError);
      return;
    }
    if (key.ctrl && key.name === "f") {
      setOverlay({ kind: "search-entry" });
      return;
    }
    if (key.ctrl && key.name === "r") {
      void openSessionPicker();
      return;
    }
    if (key.ctrl && key.name === "t") {
      void openReasoningPicker();
      return;
    }
    if (key.ctrl && key.name === "l") {
      void openModelPicker();
      return;
    }
    if (key.ctrl && key.name === "p") {
      void openProviderPicker();
      return;
    }
    if (key.ctrl && key.name === "s") {
      setOverlay({ kind: "settings" });
      return;
    }
    if (key.ctrl && !key.shift && !key.meta && !key.super && key.name === "c") {
      if (shellRunning) void cancelShell();
      else if (state.status === "running")
        void harness.cancel().catch(reportError);
      else void quit();
    }
  });

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.background,
      }}
    >
      {activeInteraction?.kind === "approval" && (
        <ApprovalOverlay
          toolName={activeInteraction.toolName}
          reason={activeInteraction.reason}
          onRespond={(outcome) => {
            void harness
              .respondApproval(activeInteraction.requestId, outcome)
              .catch(reportError);
          }}
        />
      )}
      {activeInteraction?.kind === "question" && (
        <QuestionOverlay
          key={activeInteraction.requestId}
          interaction={activeInteraction}
          onAnswer={(answer) => {
            void harness
              .respondQuestion(activeInteraction.requestId, answer)
              .catch(reportError);
          }}
        />
      )}
      {!activeInteraction && overlay.kind === "none" && (
        <box
          style={{
            flexDirection: "column",
            flexGrow: 1,
            width: "100%",
            minHeight: 0,
          }}
        >
          {state.planModeActive && <PlanBanner />}
          {state.goal && <GoalPanel goal={state.goal} />}
          <ActivityPanels subagents={state.subagents} jobs={state.jobs} />
          <WorkflowPanel runs={state.workflowRuns} />
          <ChatView
            messages={state.messages}
            streamingText={state.currentStreamingText}
          />
        </box>
      )}
      {!activeInteraction && overlay.kind === "panel" && (
        <ControlOverlay
          title={overlay.title}
          lines={overlay.lines}
          footer={overlay.footer}
        />
      )}
      {!activeInteraction && overlay.kind === "search-entry" && (
        <ControlOverlay
          title="Search transcript"
          lines={["Enter a case-insensitive query below."]}
        />
      )}
      {!activeInteraction && overlay.kind === "providers" && (
        <Picker
          title="Select provider"
          options={overlay.catalog.providers.map((provider) => ({
            value: provider.id,
            name: provider.name,
            description: `${provider.models.length} models`,
          }))}
          selectedValue={state.provider}
          onSelect={(provider) => {
            void openProviderActions(provider, overlay.catalog);
          }}
        />
      )}
      {!activeInteraction && overlay.kind === "provider-actions" && (
        <Picker
          title={`Provider — ${overlay.provider}${overlay.info.configured ? " — connected" : ""}`}
          options={[
            {
              value: "models",
              name: "Choose model",
              description: overlay.info.configured
                ? `${overlay.catalog.providers.find((item) => item.id === overlay.provider)?.models.length ?? 0} models • ${overlay.info.source ?? "authenticated"}`
                : `${overlay.catalog.providers.find((item) => item.id === overlay.provider)?.models.length ?? 0} models • not authenticated`,
            },
            ...overlay.info.methods.map((method) => ({
              value: `auth:${method.type}`,
              name: method.label,
              description:
                method.type === "oauth"
                  ? "Open provider subscription sign-in"
                  : "Store provider credentials securely",
            })),
            ...(overlay.info.credentialType !== undefined
              ? [
                  {
                    value: "logout",
                    name: "Disconnect",
                    description:
                      overlay.info.source ?? "Remove stored credential",
                  },
                ]
              : []),
          ]}
          onSelect={(action) => {
            if (action === "models")
              setOverlay({
                kind: "models",
                choices: modelChoices(
                  overlay.catalog,
                  new Set([overlay.provider]),
                ),
              });
            else if (action === "logout")
              void harness
                .logoutProvider(overlay.provider)
                .then(() => {
                  return openProviderActions(overlay.provider, overlay.catalog);
                })
                .catch(reportError);
            else
              void startProviderAuth(
                overlay.provider,
                action.slice(5) as "api_key" | "oauth",
                overlay.catalog,
              );
          }}
        />
      )}
      {!activeInteraction &&
        overlay.kind === "auth" &&
        overlay.prompt?.type === "select" && (
          <Picker
            title={overlay.prompt.message}
            options={(overlay.prompt.options ?? []).map((option) => ({
              value: option.id,
              name: option.label,
              description: option.description,
            }))}
            onSelect={(value) => {
              if (!overlay.flowId || !overlay.prompt) return;
              const { flowId, prompt } = overlay;
              setOverlay({
                ...overlay,
                prompt: undefined,
                input: "",
                lines: [...overlay.lines, "Selection submitted."],
              });
              void harness
                .respondProviderAuth(flowId, prompt.id, value)
                .catch(reportError);
            }}
          />
        )}
      {!activeInteraction &&
        overlay.kind === "auth" &&
        overlay.prompt?.type !== "select" && (
          <AuthOverlay
            provider={overlay.provider}
            lines={overlay.lines}
            prompt={overlay.prompt}
            input={overlay.input}
          />
        )}
      {!activeInteraction && overlay.kind === "models" && (
        <Picker
          title="Select model — authenticated providers"
          options={overlay.choices.map((choice) => ({
            value: choice.key,
            name: choice.name,
            description: choice.description,
          }))}
          selectedValue={JSON.stringify([state.provider, state.model])}
          searchable={true}
          onSelect={(key) => {
            const choice = overlay.choices.find(
              (candidate) => candidate.key === key,
            );
            if (!choice) return;
            setOverlay({ kind: "none" });
            void harness
              .selectModel(choice.provider, choice.model)
              .catch(reportError);
          }}
        />
      )}
      {!activeInteraction && overlay.kind === "reasoning" && (
        <Picker
          title={`Reasoning — ${state.provider}/${state.model}`}
          options={overlay.efforts.map((effort) => ({
            value: effort.id,
            name: effort.name,
            description: effort.description,
          }))}
          selectedValue={state.reasoningEffort ?? overlay.defaultEffort}
          onSelect={(level) => {
            void selectReasoning(level).catch(reportError);
          }}
        />
      )}
      {!activeInteraction && overlay.kind === "sessions" && (
        <Picker
          title="Resume session"
          options={overlay.sessions.map((session) => ({
            value: session.id,
            name: session.title,
            description: session.description,
          }))}
          selectedValue={state.sessionId}
          onSelect={(sessionId) => {
            const choice = overlay.sessions.find(
              (session) => session.id === sessionId,
            );
            if (!choice) return;
            setOverlay({ kind: "none" });
            void harness.resumeSession(choice).catch(reportError);
          }}
        />
      )}
      {!activeInteraction && overlay.kind === "themes" && (
        <Picker
          title="Select theme"
          options={THEMES.map((candidate) => ({
            value: candidate.id,
            name: candidate.name,
          }))}
          selectedValue={themeName}
          onSelect={selectTheme}
        />
      )}

      {!activeInteraction && overlay.kind === "settings" && (
        <ControlOverlay
          title="Settings"
          lines={[
            `Model:      ${state.provider}/${state.model}`,
            `Reasoning:  ${state.reasoningEffort ?? "default"}`,
            `Theme:      ${themeName}`,
            `Session:    ${state.sessionId.slice(0, 12)}…`,
            "",
            "Shortcuts:",
            "  Ctrl+L  switch model",
            "  Ctrl+T  reasoning effort",
            "  Ctrl+P  switch provider",
            "  Ctrl+R  resume session",
            "  Ctrl+S  this panel",
            "  Esc     close",
          ]}
        />
      )}

      {!activeInteraction && overlay.kind === "search-entry" && (
        <SearchInput onSubmit={showSearch} />
      )}
      <InputBar
        onSubmit={handleSubmit}
        disabled={
          state.status === "connecting" ||
          state.status === "error" ||
          (state.status === "idle" && state.activity !== null) ||
          quitting
        }
        focused={!activeInteraction && overlay.kind === "none"}
        visible={
          !activeInteraction &&
          (overlay.kind === "none" ||
            overlay.kind === "panel" ||
            overlay.kind === "providers" ||
            overlay.kind === "provider-actions" ||
            overlay.kind === "models" ||
            overlay.kind === "reasoning" ||
            overlay.kind === "sessions" ||
            overlay.kind === "themes")
        }
        placeholder={
          state.status === "running"
            ? "type next prompt; Enter queues it..."
            : state.activity
              ? `${state.activity}...`
              : undefined
        }
        attachments={state.pendingAttachments}
        queuedPromptCount={state.queuedPromptCount}
        clipboard={clipboard}
        onClipboardNotice={notify}
        onAttachPath={(path) => {
          void harness.addAttachment(path, true).catch(reportError);
        }}
        runtimeCommands={runtimeCommands}
      />
      <StatusBar
        status={state.status}
        activity={state.activity}
        activitySince={state.activitySince}
        provider={state.provider}
        model={state.model}
        reasoningEffort={state.reasoningEffort}
        tokenUsage={state.tokenUsage}
      />
    </box>
  );
}
