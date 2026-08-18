# deepseek-tui

Interactive OpenTUI client for DeepSeek Harness. It launches the sibling Harness runtime over stdio JSON-RPC and uses Qwen Token Plan by default.

## Run

Requirements: Bun, Node.js, pnpm, `../deepseek-harness`, and a Qwen Token Plan credential.

```bash
pnpm install
./bin/deepseek-tui
```

The launcher preserves its caller's working directory as the agent workspace. Authentication uses `QWEN_TOKEN_PLAN_API_KEY` when set, otherwise the existing Pi `qwen-token-plan` credential without printing it. The Qwen route is pinned to `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`.

## Providers

`Ctrl+P` and `/provider` expose 38 routes (37 installed catalog routes plus the configured local router), including ordinary OpenAI API access and OpenAI Codex subscription access as separate routes. Routes inherit the provider runtime's native endpoint, model catalog, modality metadata, reasoning levels, environment credential discovery, API-key setup, and OAuth/subscription login methods.

Selecting a provider opens its action page. Choose API-key setup to enter provider credentials in a masked field, or choose a provider subscription method to open its validated HTTP(S) authorization/device link and complete the callback or manual challenge. OpenAI uses an ordinary `OPENAI_API_KEY`; OpenAI Codex uses ChatGPT Plus/Pro OAuth. Credentials are stored in `${XDG_CONFIG_HOME:-~/.config}/deepseek-tui/auth.json` with an owner-private directory/file and never enter chat text, session history, or clipboard output. `Disconnect` removes the stored provider credential. Environment credentials shown in `.env.example` remain supported and are never copied into the store.

Like OpenCode, catalog configuration stays separate from credentials. Custom providers and overrides live in `${XDG_CONFIG_HOME:-~/.config}/deepseek-tui/providers.yaml` and hot-reload through Harness settings:

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      displayName: My Gateway
      # Omit apiKeyEnv to enable masked API-key entry in provider actions.
      # Set apiKeyEnv: MY_GATEWAY_API_KEY instead for environment-only auth.
      api: openai-completions
      baseURL: https://gateway.example/v1
      models:
        - id: my-model
          name: My Model
          contextWindow: 131072
          maxTokens: 16384
          input: [text, image]
```

A catalog route can be overridden with only changed fields; omit `models` to retain its complete installed model catalog.

## Commands

| Command                   | Action                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/model [model-id]`       | Select an exact current-provider model, or open authenticated models when omitted.                   |
| `/models`                 | Fuzzy-search models across every authenticated provider.                                             |
| `/provider [provider-id]` | Open provider actions for authentication, disconnect, and model selection.                           |
| `/reasoning [level]`      | Pick an adapter-declared reasoning level for current model.                                          |
| `/new`                    | Close the current live agent and start a blank session on the selected route.                        |
| `/sessions`               | Browse durable sessions by title/time and explicitly resume a saved session.                         |
| `/attach <path>`          | Validate, durably save, and queue a PNG, JPEG, WebP, or GIF for the next prompt.                     |
| `/unattach`               | Clear queued images without sending them.                                                            |
| `/clear`                  | Clear displayed messages without changing model context or durable session history.                  |
| `/compact`                | Run Harness manual compaction outside the model-message stream.                                      |
| `/cancel`                 | Request cancellation of the active turn; ready state returns when Harness reports idle.              |
| `/status`                 | Show session id, route, lifecycle state, token totals, and theme.                                    |
| `/search <query>`         | Search displayed transcript text case-insensitively.                                                 |
| `/copy [last\|all]`       | Copy latest user/assistant message or full conversation transcript, including current streamed text. |
| `/shell <command>`        | Run one owned, bounded local shell process group outside model history.                              |
| `/theme [name]`           | Open the 23-theme picker or select and remember an exact theme id.                                   |
| `/help`                   | Show local and runtime-discovered commands.                                                          |
| `/quit`                   | Shut down the Harness runtime and exit.                                                              |

Unknown slash commands are offered to the Harness command registry and never sent to the model as ordinary messages. Live status uses an animated activity label for model waits, reasoning, tool execution, and context compaction; elapsed seconds remain visible during silent operations. Automatic compaction uses `qwen3.6-flash` while conversation turns retain the selected route, reducing checkpoint latency without changing chat-model selection. Reasoning stays out of final-answer Markdown, completed tool output is collapsed, and fenced Go, Python, Bash, Rust, JavaScript, and TypeScript blocks use Tree-sitter highlighting. A leading `!command` is shorthand for `/shell command`; only one shell command runs at once. Shell commands run in the caller workspace with a 120-second timeout and bounded output, never enter model-visible history, and own a detached process group cleaned up with TERM then KILL on cancellation or shutdown. Clipboard notices distinguish verified host writes from unverified terminal OSC52 attempts.

Built-in themes: Tokyo Night, Dracula, Nord, Catppuccin Mocha/Latte, Gruvbox Dark/Light, Solarized Dark/Light, One Dark, Monokai, Rosé Pine, Everforest, Kanagawa, Ayu Dark, GitHub Dark/Light, Ocean, Synthwave, Matrix, Sepia, Minimal Light, and High Contrast.

## Keys

- `Enter`: send; during an active model turn, queue follow-up prompt
- `Shift+Enter`: newline
- `Tab`: complete a slash command
- Double-click a composer word: select it and copy it to host clipboard
- `Cmd+A` / `Cmd+C` / `Cmd+V`: composer shortcuts when terminal forwards Command keys
- `Ctrl+Shift+A`, `Ctrl+Y`, `Ctrl+V`: terminal-forwarded select-all/copy/paste
- `Ctrl+Shift+C` / `Ctrl+Shift+V` or `Ctrl+Insert` / `Shift+Insert`: additional terminal fallbacks
- Ordinary terminal bracketed paste remains supported
- `Esc`: reject/cancel a pending interaction; otherwise cancel active shell, close overlay, or cancel active model turn
- `Ctrl+F`: transcript search entry
- `Ctrl+R`: durable session picker
- `Ctrl+L`: fuzzy model picker across authenticated providers
- `Ctrl+P`: provider picker
- `Ctrl+T`: reasoning-level picker for current model
- `Ctrl+C`: cancel active shell or model turn; otherwise quit

## Sessions, interactions, and images

Persisted sessions remain under `<workspace>/.sessions`. `/sessions` reads them through the Harness session-query API, reconstructs visible history from validated events, and resumes only an explicitly selected saved session; the TUI never parses JSONL files.

Harness approval and question requests preempt ordinary overlays. Approval defaults to rejection, `Esc` rejects or cancels, and question batches accept option labels or numbers, comma-separated multi-select values, and custom text. Shutdown rejects or cancels pending requests before closing the runtime. The default local bash executor does not request approval for ordinary commands; the approval modal activates when a composed Harness consumer raises an approval request.

`/attach` accepts only regular files contained in the caller workspace. Dragging one PNG, JPEG, WebP, or GIF into the composer recognizes the terminal-pasted absolute path and explicitly admits that external image. Both paths reject symlinks, query deployment image limits, then read at most `maxImageBytes + 1` through one file handle. Only a basename and durable attachment reference enter UI/model history; local paths and base64 never do. The selected catalog model must advertise image input. Attachment admission and prompt admission are serialized. Enter during an active turn snapshots queued images into that follow-up, clears them from the composer, and dispatches queued prompts FIFO after each turn becomes idle. Composer input remains enabled during model work without resetting the active stream. The runtime verifies declared media type and image bytes through its durable attachment service.
