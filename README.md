# deepseek-tui

A terminal client for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> ### This needs a specific harness build
>
> The TUI calls L2 runtime methods — `settings/get`, `settings/set`,
> `skills/list`, `agent-presets/list` — that are **not in upstream
> `deepseek-ai/deepseek-harness`** and not in release `0.1.0-rc.7`. They live on
> the **`v0.1.0-l2`** tag of
> **[Cass67/deepseek-harness](https://github.com/Cass67/deepseek-harness)**.
>
> Against upstream, the app **boots normally and then fails** the moment
> anything reads settings: the settings overlay, the skill and agent-preset
> pickers, and last-model-restore. There is no version to pin — every
> dependency bar `react` and `@opentui/*` is a `link:` into a sibling checkout,
> so you get whatever is in that working tree.
>
> `scripts/install.mjs` sets this up for you.

The TUI is a thin client: it spawns the harness as a subprocess and speaks
stdio JSON-RPC to it. The harness side is composed by this repo's `cordis.yml`,
layered over the plugins `@deepseek-ai/dsh-agent-spine-demo` mounts underneath.
Every durable session event streams back and drives the UI, so the panels are
projections of the event log rather than local state.

Built with Bun, React and [OpenTUI](https://github.com/sst/opentui).

## Install

Requires **Bun**, **Node.js**, **pnpm** and **git**.

```bash
git clone https://github.com/Cass67/deepseek-tui.git
cd deepseek-tui
node scripts/install.mjs
./bin/deepseek-tui
```

The installer clones the harness fork to `../deepseek-harness`, installs it,
**builds it**, installs this app, and verifies the required L2 methods respond.
It is safe to re-run, and never rewrites an existing harness checkout — if one
is present but on the wrong revision it tells you the command to fix it.

The build step is not optional and is the slow part: the harness gitignores
`lib/`, and every `link:` dependency resolves through `exports` to `./lib/`.
A cloned-but-unbuilt harness resolves nothing.

```bash
node scripts/install.mjs --check   # report only, change nothing
node scripts/preflight.mjs         # do the L2 methods actually respond?
```

| Variable                               | Effect                                                      |
| -------------------------------------- | ----------------------------------------------------------- |
| `DSH_HARNESS_PATH`                     | Where the harness lives. Defaults to `../deepseek-harness`. |
| `DSH_HARNESS_REPO` / `DSH_HARNESS_REF` | Clone source. Defaults to the fork and the `v0.1.0-l2` tag. |

## Run

```bash
./bin/deepseek-tui
```

The launcher preserves its caller's working directory as the agent workspace,
and refuses to start with a pointer to the installer if the harness is missing
or unbuilt.

### Environment

| Variable                     | Effect                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `DSH_PROVIDER` / `DSH_MODEL` | Pin the route. Overrides the remembered one.                                       |
| `DSH_MAX_TOKENS`             | Output cap per turn. Defaults to `16384`; some routes allow far more.              |
| `DSH_CWD`                    | Agent workspace. Defaults to the launcher's cwd.                                   |
| `LOCAL_LLM_BASE_URL`         | Endpoint for the `local-llm-router` route. Defaults to `http://localhost:3200/v1`. |
| `CONTEXT7_API_KEY`           | Raises context7 rate limits. Optional.                                             |

Without `DSH_PROVIDER`/`DSH_MODEL`, a new session resumes the **last route you
selected**, persisted in the `agent-default-model` settings namespace.

A host name local to one network belongs in your own config, not in this repo.
Set `LOCAL_LLM_BASE_URL`, or override the route per machine in
`${XDG_CONFIG_HOME:-~/.config}/deepseek-tui/providers.yaml` — settings there win
over `cordis.yml`:

```yaml
llm-pi-ai:
  providers:
    local-llm-router:
      baseURL: http://my-box:3200/v1
```

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
| `/permission`             | Switch the sandbox + approval preset (runtime-discovered from the harness).                          |
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
- `Ctrl+S`: settings overlay (model, reasoning, theme, session, shortcuts)
- `Ctrl+K`: skill picker
- `Ctrl+A`: agent-preset picker
- `Ctrl+D`: working-directory picker
- `Ctrl+E`: trajectory (session event timeline)
- `Ctrl+O`: deliverables (files written, commands run)
- `Ctrl+C`: cancel active shell or model turn; otherwise quit

## Sessions, interactions, and images

Persisted sessions remain under `<workspace>/.sessions`. `/sessions` reads them through the Harness session-query API, reconstructs visible history from validated events, and resumes only an explicitly selected saved session; the TUI never parses JSONL files.

Harness approval and question requests preempt ordinary overlays. Approval defaults to rejection, `Esc` rejects or cancels, and question batches accept option labels or numbers, comma-separated multi-select values, and custom text. Shutdown rejects or cancels pending requests before closing the runtime. The default local bash executor does not request approval for ordinary commands; the approval modal activates when a composed Harness consumer raises an approval request.

`/attach` accepts only regular files contained in the caller workspace. Dragging one PNG, JPEG, WebP, or GIF into the composer recognizes the terminal-pasted absolute path and explicitly admits that external image. Both paths reject symlinks, query deployment image limits, then read at most `maxImageBytes + 1` through one file handle. Only a basename and durable attachment reference enter UI/model history; local paths and base64 never do. The selected catalog model must advertise image input. Attachment admission and prompt admission are serialized. Enter during an active turn snapshots queued images into that follow-up, clears them from the composer, and dispatches queued prompts FIFO after each turn becomes idle. Composer input remains enabled during model work without resetting the active stream. The runtime verifies declared media type and image bytes through its durable attachment service.

## Capabilities

`cordis.yml` plus the spine expose **47 model-facing tools** — 21 of the 24 tool
packages in the harness's generated `docs/tool-catalog.md`, plus MCP.

| Area       | Tools                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Files      | `read`, `write`, `edit`, `read_image`, `str_replace_editor`, `glob`, `grep`                                     |
| Shell      | `bash` (sandbox-confined; background runs become jobs)                                                          |
| Terminal   | `terminal_open`, `terminal_read`, `terminal_send`, `terminal_close`, `terminal_list`, `terminal_signal`         |
| Jobs       | `job_list`, `job_output`, `job_kill`                                                                            |
| Delegation | `subagent`, `subagent_fork`, `claude_code`, `codex`, `send_message`, `interrupt_agent`, `list_agents`, `report` |
| Planning   | `exit_plan_mode`, `create_goal`, `get_goal`, `update_goal`, `todo_write`                                        |
| Workflow   | `workflow`, `ralph`                                                                                             |
| Web        | `web_search`, `web_fetch`                                                                                       |
| Sessions   | `session_search`, `session_trace`, `session_event_read`, `session_event_search`, `session_event_trace`          |
| Schedule   | `schedule_create`, `schedule_list`, `schedule_delete`                                                           |
| Code       | `lsp`, `run_code`                                                                                               |
| Skills     | `skill`                                                                                                         |
| Ask        | `ask_user_question`                                                                                             |
| MCP        | `mcp__context7__resolve-library-id`, `mcp__context7__query-docs`                                                |

**Sandbox.** `dsh-fs-sandbox` and `dsh-bash-sandbox` replace the plain local
backends, so writes and commands are confined by `ctx.sandboxPolicy` — seatbelt
on macOS, bwrap/landlock on Linux. Default mode is `workspace-write`;
`/permission` switches presets. A write outside the workspace comes back
`[sandbox: file access denied under workspace-write mode]`.

**Delegation.** `subagent`/`subagent_fork` run in-process. `claude_code` and
`codex` shell out to the real product CLIs in the same workspace, so a child
can be a genuinely different agent. Both are one-shot.

**MCP.** One row per server in `cordis.yml`; context7 ships wired up. MCP tools
register asynchronously after the server connects, so they appear shortly after
boot rather than at startup.

**Skills.** Read from `.dsh/skills/<name>/SKILL.md`, with `name` and
`description` frontmatter required. This repo ships `mount-harness-plugin`.

**Hooks.** Claude-Code format from `<workspace>/.claude/settings.json`, Codex
format from `$CODEX_HOME/config.toml`. A missing file registers no handlers.

## Agent presets

`Ctrl+A`. Named by the kind of work, not the model — each preset's composition
picks its own route, so retuning is a two-line edit.

| Preset     | For                                                                      |
| ---------- | ------------------------------------------------------------------------ |
| `build`    | The main worker. Plans, edits, runs things, sees a change through.       |
| `research` | Light and fast. Reads, searches, looks up docs.                          |
| `verify`   | Checks work already done. Routed to a different model family on purpose. |

They live in `.dsh/presets/<id>/`: `agent.cordis.yml` is the per-session
composition, `preset.yml` the display name and description, and the directory
name is the id. Selecting one writes the `agent-presets` settings namespace —
there is no `/preset` command.

## Development

```bash
bunx tsc --noEmit     # types
bun test              # unit tests
bun run build         # bundle to dist/
bunx eslint src
```

Because most behaviour lives in a subprocess, several checks drive the real
harness instead of mocking it:

| Script                                | Checks                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `scripts/install.mjs --check`         | The harness checkout exists, is on the right revision, and is built     |
| `scripts/preflight.mjs`               | The linked harness has the L2 methods this client calls                 |
| `scripts/boot-test.mjs`               | The composition loads and reports its commands                          |
| `scripts/l2-probe.mjs`                | Which L2 methods the harness answers                                    |
| `scripts/tool-audit.mjs`              | Which tools actually register, by reading the schemas sent to the model |
| `scripts/tool-exec-check.mjs`         | Tools genuinely execute, including a sandbox refusal that must fail     |
| `scripts/settings-roundtrip.mjs`      | `settings/get` → `set` → read-back → restore                            |
| `scripts/route-persistence-check.mjs` | The remembered route survives a process restart                         |

`tool-audit` and `tool-exec-check` stand up a stub OpenAI-compatible endpoint,
so they need no live model. The endpoint must stream: the harness always sends
`stream: true`, and a plain JSON body is silently discarded and retried.

Mounting a plugin does not mean its tools register — several need a provider or
a config flag first. Measure with `tool-audit` rather than reading `cordis.yml`.

## Not mounted, and why

Everything else the harness ships is deliberately absent:

- `dsh-subagent-dsh-sdk`, `dsh-subagent-acp` — need a second runtime or an ACP
  agent to talk to.
- `dsh-web-search-exa`, `dsh-web-search-perplexity` — need API keys.
- `dsh-tool-pwsh`, `dsh-pwsh-*`, `dsh-sandbox-windows-acl` — Windows only.
- `dsh-tool-cordis` — ships in no tree by design; dynamic code reaches the real
  runtime.
- `dsh-tool-bash-persistent` — superseded by the terminal tools, and would
  collide with `bash`.
- `dsh-fs-local`, `dsh-bash-local` — replaced by their sandbox equivalents.
- `dsh-hook-protocol`, `dsh-jobs`, `dsh-shell`, `dsh-code-runtime`,
  `dsh-sandbox` — types-only or abstract bases; mounting them fails to load.

## License

[Apache-2.0](LICENSE). The DeepSeek Harness packages it links against are MIT
and retain their own terms — see [NOTICE](NOTICE).
