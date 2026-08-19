# Configuration

Three layers decide how the TUI behaves. Highest wins.

| Layer         | Where                                   | Scope                   | Reload           |
| ------------- | --------------------------------------- | ----------------------- | ---------------- |
| Settings file | `~/.config/deepseek-tui/providers.yaml` | Your machine, untracked | Hot — no restart |
| Environment   | shell / `.env`                          | One launch              | On launch        |
| Composition   | `cordis.yml` in the repo                | Everyone who clones     | On restart       |

The composition is the base: it names which plugins load and gives each one its
default config. The settings file overrides any _namespace_ a plugin registered,
per key, while the app is running. Environment variables are read by `!!js`
expressions inside `cordis.yml`, so they feed the base layer, not the top one —
a value written in the settings file beats the env var that produced the default.

## The files

| Path                                      | Written by      | Holds                                                                                                                                              |
| ----------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cordis.yml`                              | repo            | Plugin composition and defaults. Tracked — keep machine-specific values out                                                                        |
| `~/.config/deepseek-tui/providers.yaml`   | you and the app | Settings overrides for any registered namespace. Path from `DEEPSEEK_TUI_CONFIG`, else `${XDG_CONFIG_HOME:-~/.config}/deepseek-tui/providers.yaml` |
| `~/.config/deepseek-tui/preferences.json` | the app         | Theme only (`src/preferences.ts`). Mode `600`                                                                                                      |
| `~/.dsh/.credentials.yaml`                | the app         | Provider API keys, keyed by credential-ref name. Mode `600`, refused if group/other bits are set                                                   |
| `~/.dsh/`                                 | the harness     | Harness home: `sessions/`, `storages/`, `attachments/`, `profiles/`. Override with `DSH_HOME`                                                      |
| `.dsh/presets/<id>/`                      | repo            | Named agents for `Ctrl+A` — `agent.cordis.yml` plus `preset.yml`                                                                                   |
| `.dsh/skills/`                            | repo            | Skill packs for `Ctrl+K`                                                                                                                           |
| `.claude/settings.json`                   | you             | Claude-Code-format lifecycle hooks. Absent is fine                                                                                                 |
| `${CODEX_HOME:-~/.codex}/config.toml`     | you             | Codex-format lifecycle hooks. Absent is fine                                                                                                       |
| `.sessions/`                              | the app         | Session log, index, checkpoints. Override with `DSH_SESSION_ROOT`                                                                                  |

`~/.dsh/settings.yaml` is **not** read by this TUI. `cordis.yml` gives
`dsh-settings-file` an explicit `path`, and that beats the harness-home default
of `<DSH_HOME>/settings.yaml`. A file there belongs to some other harness
deployment sharing the same home.

## Environment variables

| Variable                                         | Default                                                     | Effect                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `DSH_PROVIDER`                                   | `qwen-token-plan`                                           | Starting route. Without it the last selected route is restored from settings |
| `DSH_MODEL`                                      | `qwen3.8-max-preview`                                       | Starting model                                                               |
| `DSH_MAX_TOKENS`                                 | `16384`                                                     | Output cap per turn                                                          |
| `DSH_CWD`                                        | launcher cwd                                                | Agent workspace; also the sandbox `workspaceRoot`                            |
| `DSH_SESSION_ROOT`                               | `./.sessions`                                               | Session log root                                                             |
| `DSH_SYSTEM_PROMPT`                              | built-in persona                                            | Replaces the agent persona wholesale                                         |
| `DSH_HOME`                                       | `~/.dsh`                                                    | Harness home — credentials, sessions, attachments, profiles                  |
| `DSH_CORDIS_CONFIG`                              | `<repo>/cordis.yml`                                         | Composition file to load                                                     |
| `DSH_HARNESS_BIN`                                | resolved from the harness checkout                          | JSON-RPC server entry point                                                  |
| `DSH_HARNESS_PATH`                               | `../deepseek-harness`                                       | Harness checkout (`bin/deepseek-tui`, `scripts/install.mjs`)                 |
| `DSH_HARNESS_REPO` / `DSH_HARNESS_REF`           | upstream / `v0.1.0-l2`                                      | What `scripts/install.mjs` clones                                            |
| `DEEPSEEK_TUI_CONFIG`                            | `${XDG_CONFIG_HOME:-~/.config}/deepseek-tui/providers.yaml` | Settings file path                                                           |
| `LOCAL_LLM_BASE_URL`                             | `http://localhost:3200/v1`                                  | Endpoint for the `local-llm-router` route                                    |
| `LOCAL_LLM_API_KEY`                              | `dummy-local-llm`                                           | Bearer sent to that route                                                    |
| `DEEPSEEK_API_KEY`                               | —                                                           | DeepSeek chat and web search                                                 |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_SEARCH_BASE_URL` | public API                                                  | Separate endpoints — chat speaks completions, search speaks Messages         |
| `QWEN_TOKEN_PLAN_API_KEY`                        | falls back to `pi auth print-api-key`                       | Qwen route credential                                                        |
| `CONTEXT7_API_KEY`                               | unset                                                       | Raises context7 MCP rate limits                                              |
| `CODEX_HOME`                                     | `~/.codex`                                                  | Where Codex-format hooks are read from                                       |
| `XDG_CONFIG_HOME`                                | `~/.config`                                                 | Base for the settings and preferences files                                  |

## A complete settings file

Every namespace below is registered by a plugin this repo composes, so every key
is live. Nothing here is required — an absent file means "use the composition".

```yaml
# ~/.config/deepseek-tui/providers.yaml

# ── Which route a new session starts on ─────────────────────────────────────
# The app rewrites this block whenever you switch model, so it is also how the
# TUI remembers your last route across launches.
agent-default-model:
  provider: local-llm-router
  model: router
  reasoningEffort: xhigh # optional; off|minimal|low|medium|high|xhigh|max

# ── Which named agent Ctrl+A starts from ────────────────────────────────────
# Must name a directory under .dsh/presets/. Takes effect on the next session.
agent-presets:
  default: build

# ── Sandbox + approval bundle ───────────────────────────────────────────────
# Only the preset choice is settings-writable; the preset table itself lives in
# cordis.yml. Stock names: workspace-write, danger-full-access.
permission:
  defaultPreset: workspace-write

# ── Shell executor ──────────────────────────────────────────────────────────
shell:
  timeoutMs: 120000 # default per command
  maxTimeoutMs: 600000 # ceiling a caller may request
  maxOutputBytes: 64000 # beyond this, output spills to a file
  graceMs: 2000 # TERM-to-KILL window on cancellation

# ── Provider routes ─────────────────────────────────────────────────────────
# Keyed by route id. A key that names an installed pi-ai catalog provider
# overrides that provider field by field; a key pi-ai has never heard of is a
# whole provider declaration and must describe itself.
llm-pi-ai:
  providers:
    # Overriding a catalog route: state only what differs.
    qwen-token-plan:
      reasoning: medium
      modelOverrides:
        qwen3.8-max-preview:
          contextWindow: 196608

    # Declaring a route from nothing. Every field the catalog cannot supply
    # has to be here or fall back to the documented default.
    local-llm-router:
      displayName: Local LLM Router # default: the route key
      api:
        openai-completions # openai-completions | openai-responses |
        # anthropic-messages | azure-openai-responses
      baseURL: http://ubt26:3200/v1
      apiKeyEnv: LOCAL_LLM_API_KEY # names a credential, never holds one
      headers: # sent on every request
        Authorization: Bearer dummy-local-llm
      reasoning: low # default level; off|minimal|low|medium|high|xhigh|max
      defaultContextWindow: 262144 # applied to models that state none
      defaultMaxTokens: 32768
      defaultInput: [text] # text | image
      cacheRetention: none # none | short | long
      transport: auto # sse | websocket | websocket-cached | auto
      timeoutMs: 600000
      websocketConnectTimeoutMs: 10000
      streamIdleTimeoutMs: 300000 # silence before a stream is abandoned
      thinkingBudgets: # token budgets per level, where supported
        minimal: 1024
        low: 4096
        medium: 16384
        high: 32768
      compat:
        thinkingFormat:
          openai # openai | deepseek | openrouter | together |
          # zai | qwen | string-thinking | ant-ling
        supportsReasoningEffort: true
      retryPolicy:
        mode: normal # normal | always
        maxRetries: 2
        retryableCodes: [EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT]
        backoff:
          initialDelayMs: 500
          maxDelayMs: 10000
          jitterRatio: 0.1
      models:
        - id: router # the only required field
          name: Qwen3.8-27b # what the picker shows
          contextWindow: 256000
          maxTokens: 49152
          input: [text]
          reasoningEfforts: # offered level -> wire spelling.
            low: low # `false` disables reasoning entirely;
            medium: medium # a valueless key sends no effort value.
            high: xhigh
            xhigh: xhigh

# ── DeepSeek's own chat adapter (separate from the pi-ai routes) ────────────
llm-deepseek:
  apiKeyEnv: DEEPSEEK_API_KEY
  baseURL: https://api.deepseek.com
  thinking: enabled # enabled | disabled
  reasoningEffort: high # off | low | high | max
  maxTokens: 32768
  defaultContextWindow: 262144
  streamIdleTimeoutMs: 300000
  models:
    - id: deepseek-v4-pro
      name: DeepSeek-V4-Pro
      contextWindow: 262144
      maxTokens: 32768

# ── Web search ──────────────────────────────────────────────────────────────
web-search-deepseek:
  apiKeyEnv: DEEPSEEK_API_KEY
  baseURL: https://api.deepseek.com
  model: deepseek-v4-pro
  maxTokens: 4096
  maxUses: 5 # search calls per turn
```

An unserviceable route is rejected at the point it is _written_, not at the
first request: `settings.mutate` answers `settings-rejected` naming the route
and model at fault. A malformed file therefore fails loudly on save rather than
silently disabling the namespace.

### Credentials never go in this file

`apiKeyEnv` names a credential; it does not hold one. Resolution order is the
credential store (`~/.dsh/.credentials.yaml`, written by the provider action
page) then the environment variable of that name. Keys stay out of chat text,
session history, and clipboard output.

## Hooks

Shell commands the harness runs at fixed points in a session. They are the one
extension surface that can **refuse** work: a hook's exit code or stdout can
deny a tool call before it runs. Two bridges are mounted, both reading a file
that may not exist — a missing or malformed file logs a warning and registers
no handlers, never failing boot.

| Bridge              | Reads                                 | Events                                                                                                   |
| ------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `hooks-claude-code` | `<workspace>/.claude/settings.json`   | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart`, `SubagentStop` |
| `hooks-codex`       | `${CODEX_HOME:-~/.codex}/config.toml` | `PreToolUse`, `PostToolUse`, `SessionStart`, `UserPromptSubmit`, `Stop`                                  |

Only `type: "command"` hooks run. Anything else is skipped with a warning, as
are Codex hooks marked `async: true`.

### Claude-Code format

Either a settings object with a `hooks` key, or the bare event map.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "bash|write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/scripts/gate.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "write|str_replace_editor",
        "hooks": [{ "type": "command", "command": "npx prettier --write ." }]
      }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "echo done >> .audit" }] }
    ]
  }
}
```

`matcher` is a regex over the subject — the tool name for the tool events. It is
**discarded** on `UserPromptSubmit` and `Stop`, which have no subject. An
invalid regex is a hard `SyntaxError` that rejects the whole config rather than
half-registering it. `timeout` is in **seconds**; the default is 600 000 ms.

`${CLAUDE_PROJECT_DIR}` and `${CLAUDE_PLUGIN_ROOT}` are substituted into every
command at parse time, from the `projectDir`/`pluginRoot` config in `cordis.yml`.
A token whose variable is unset is left verbatim. Codex performs no
substitution.

### What a hook receives

A JSON payload on stdin carrying `session_id`, `cwd`, `hook_event_name`, and —
on the tool events — `tool_name` and `tool_input`.

### What a hook can decide

| Exit  | Meaning                                                                               |
| ----- | ------------------------------------------------------------------------------------- |
| `0`   | Success. stdout starting with `{` is parsed as a structured decision                  |
| `2`   | Blocking. stderr becomes the `reason`                                                 |
| other | Non-blocking failure; stderr is summarized into the session log (capped at 500 chars) |

Structured stdout on exit 0 carries a `decision` and optional `reason`, plus a
`hookSpecificOutput` block guarded by `hookEventName` — a block naming a
different event is discarded while top-level fields survive.

Where a `deny` lands depends on the event:

| Event              | On deny                                                      |
| ------------------ | ------------------------------------------------------------ |
| `PreToolUse`       | The tool call never runs; `reason` goes back to the model    |
| `PostToolUse`      | The result is replaced by `reason` and fed back to the model |
| `UserPromptSubmit` | The turn is refused                                          |

When several hooks match one point, outcomes merge by strictness —
`deny`/`block` > `ask` > `approve`/`allow` — reasons for the winning rank are
joined, and added context accumulates in hook order. One hook denying is enough.

### Tuning the bridges

Both rows in `cordis.yml` take the same knobs:

```yaml
- id: hooks-claude-code
  name: "@deepseek-ai/dsh-hooks-claude-code"
  config:
    configPath: !!js ((process.env.DSH_CWD ?? process.cwd()) + '/.claude/settings.json')
    projectDir: !!js process.env.DSH_CWD ?? process.cwd()
    pluginRoot: /opt/my-plugin # substituted into ${CLAUDE_PLUGIN_ROOT}
    defaultTimeoutMs: 600000 # per hook, unless the hook sets `timeout`
    stderrSummaryMaxChars: 500 # how much stderr reaches the session log
```

## Agent presets

A preset is a directory under `.dsh/presets/<id>/`:

```yaml
# .dsh/presets/build/preset.yml
name: build
description: The main worker. Plans, edits, runs things, and sees a change through.
```

```yaml
# .dsh/presets/build/agent.cordis.yml — a per-session composition, so any
# plugin row may be restated here, not only the route.
- id: preset-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: qwen-token-plan
    model: qwen3.8-max-preview
```

The directory name is the id. Selecting one writes the `agent-presets`
namespace — there is no `/preset` command.

## Composition knobs worth knowing

These live in `cordis.yml` and need a restart. Full list is the file itself.

| Row                    | Knob                                                     | Default here                                          |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `sandbox-policy`       | `mode`                                                   | `workspace-write` (`read-only`, `danger-full-access`) |
| `agent-spine`          | `persona`, `tools.mode`, `workspaceContext.maxBytes`     | `both`, 128 KiB                                       |
| `compaction-basic`     | `thresholdRatio`, `retainRatio`, `summarizationProvider` | `0.4`, `0.16`, `qwen-token-plan`                      |
| `tool-result-pruner`   | `thresholdChars`, `headChars`, `tailChars`               | 8192 / 4096 / 1024                                    |
| `spill-policy`         | `maxInlineBytes`                                         | 50000                                                 |
| `session-query-sqlite` | `path`, `openAt`                                         | `.sessions/session-index.sqlite`, `first-search`      |
| `mcp-context7`         | `command`, `args`, `failOnStartupError`                  | `npx @upstash/context7-mcp`, `false`                  |
| `tool-ralph`           | `maxRounds`                                              | 64                                                    |
| `lsp-stdio`            | `servers`                                                | `typescript-language-server --stdio`                  |

Add an MCP server with one `@deepseek-ai/dsh-mcp-client` row per server;
`serverName` and `command` are both required.
