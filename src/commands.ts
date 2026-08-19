/** Local command vocabulary; unresolved commands are offered to Harness. */

export type LocalCommandName =
  | "help"
  | "status"
  | "model"
  | "models"
  | "provider"
  | "reasoning"
  | "new"
  | "sessions"
  | "attach"
  | "unattach"
  | "clear"
  | "cancel"
  | "compact"
  | "search"
  | "copy"
  | "shell"
  | "theme"
  | "thinking"
  | "quit";

export interface CommandDefinition {
  name: string;
  usage: string;
  description: string;
}

export const COMMANDS: readonly CommandDefinition[] = [
  { name: "help", usage: "/help", description: "Show commands and shortcuts" },
  {
    name: "status",
    usage: "/status",
    description: "Show session and route details",
  },
  {
    name: "model",
    usage: "/model [model-id]",
    description: "Choose current-provider model or browse authenticated models",
  },
  {
    name: "models",
    usage: "/models",
    description: "Fuzzy-search models across authenticated providers",
  },
  {
    name: "provider",
    usage: "/provider [provider-id]",
    description: "Configure provider authentication",
  },
  {
    name: "reasoning",
    usage: "/reasoning [level]",
    description: "Choose reasoning level for current model",
  },
  { name: "new", usage: "/new", description: "Start a new conversation" },
  {
    name: "sessions",
    usage: "/sessions",
    description: "Browse and resume durable sessions",
  },
  {
    name: "attach",
    usage: "/attach <path>",
    description: "Queue a verified image for the next prompt",
  },
  { name: "unattach", usage: "/unattach", description: "Clear queued images" },
  {
    name: "clear",
    usage: "/clear",
    description: "Clear displayed messages; retain model context",
  },
  { name: "cancel", usage: "/cancel", description: "Cancel active turn" },
  {
    name: "compact",
    usage: "/compact",
    description: "Compact current conversation context",
  },
  {
    name: "search",
    usage: "/search <query>",
    description: "Search the displayed transcript",
  },
  {
    name: "copy",
    usage: "/copy [last|all]",
    description: "Copy the latest message or transcript",
  },
  {
    name: "shell",
    usage: "/shell <command>",
    description: "Run a local one-shot shell command",
  },
  {
    name: "theme",
    usage: "/theme [name]",
    description: "Choose a color theme",
  },
  {
    name: "thinking",
    usage: "/thinking [on|off]",
    description: "Show or hide the model's reasoning in the transcript",
  },
  { name: "quit", usage: "/quit", description: "Shut down runtime and exit" },
];

export type ParsedInput =
  | { kind: "message"; text: string }
  | { kind: "command"; name: string; args: string; line: string }
  | { kind: "shell"; command: string };

/** Parse one submitted input without interpreting unknown command names. */
export function parseInput(input: string): ParsedInput {
  const text = input.trim();
  if (text.startsWith("!"))
    return { kind: "shell", command: text.slice(1).trim() };
  if (!text.startsWith("/")) return { kind: "message", text };

  const separator = text.search(/\s/);
  const token = separator === -1 ? text : text.slice(0, separator);
  return {
    kind: "command",
    name: token.slice(1).toLowerCase(),
    args: separator === -1 ? "" : text.slice(separator).trim(),
    line: text,
  };
}

export interface RuntimeCommandDefinition {
  name: string;
  description: string;
  input?: { hint: string };
}

/** Return local and runtime command matches for an incomplete leading slash token. */
export function commandSuggestions(
  input: string,
  runtimeCommands: readonly RuntimeCommandDefinition[] = [],
): readonly CommandDefinition[] {
  const text = input.trimStart();
  if (!text.startsWith("/") || /\s/.test(text)) return [];
  const prefix = text.slice(1).toLowerCase();
  const localNames = new Set<string>(COMMANDS.map((command) => command.name));
  const commands: CommandDefinition[] = [
    ...COMMANDS,
    ...runtimeCommands
      .filter((command) => !localNames.has(command.name.toLowerCase()))
      .map((command) => ({
        name: command.name.toLowerCase(),
        usage: `/${command.name}${command.input ? ` ${command.input.hint}` : ""}`,
        description: command.description,
      })),
  ];
  return commands.filter((command) => command.name.startsWith(prefix));
}

/** Format broad command catalogs compactly while retaining detail for narrowed matches. */
export function formatCommandSuggestions(
  commands: readonly CommandDefinition[],
  width = 76,
): string {
  const lineWidth = Math.max(12, width);
  if (commands.length <= 8) {
    return commands
      .map((command) => {
        const line = `${command.usage.padEnd(Math.min(28, lineWidth))} ${command.description}`;
        return line.length > lineWidth
          ? `${line.slice(0, lineWidth - 1)}…`
          : line;
      })
      .join("\n");
  }

  const lines: string[] = [];
  for (const token of commands.map((command) => `/${command.name}`)) {
    const current = lines.at(-1);
    if (!current || current.length + token.length + 2 > lineWidth)
      lines.push(token);
    else lines[lines.length - 1] = `${current}  ${token}`;
  }
  return lines.join("\n");
}
