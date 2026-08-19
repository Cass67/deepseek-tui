# Progress Tracker

## Phase 1 — Core plugins + basic panels ✅

- [x] Mount 15 harness plugins in cordis.yml
- [x] Todo panel (driven by `todo/change` events)
- [x] Plan banner (driven by `plan/change` events)
- [x] Boot test, typecheck, unit tests all green

## Phase 2 — Subagents, jobs, web, ralph ✅

- [x] Subagent stack (spawn, fork, control, list, report)
- [x] Background jobs (`enableRunInBackground`, `tool-jobs`)
- [x] Web search (`web`, `web-search-deepseek`, `tool-web`)
- [x] Ralph loop (`tool-ralph`, `workflow-worker-thread`)
- [x] ActivityPanels (subagents + jobs panels in UI)
- [x] Live pty tests verified

## Phase 3 — Richer UI + L2 protocol ✅

- [x] Goal panel, workflow view, settings overlay, feedback tracking
- [x] Skill picker (`Ctrl+K`) — `listSkills` now passes the workspace directory,
      without which it always returned an empty list
- [x] Agent-preset picker (`Ctrl+A`)
- [x] Directory picker (`Ctrl+D`)
- [x] Trajectory view (`Ctrl+E` — moved off `Ctrl+Y`, which the composer binds
      to paste)
- [x] Deliverables panel (`Ctrl+O`)
- [x] L2 protocol — **no harness work was needed**. `skills/list`,
      `settings/get`, `settings/set` and `agent-presets/list` already ship in
      `dsh-sdk-client` + `dsh-sdk-jsonrpc-server`; verified with
      `scripts/l2-probe.mjs` and `scripts/settings-roundtrip.mjs`.
- [x] Event vocabulary swept. `src/events.test.ts` imports the harness's own
      `KNOWN_SESSION_EVENT_TYPES` and fails if a type is neither rendered in
      `trajectorySummary` nor listed in `UNSURFACED_EVENT_TYPES`.

`mcp/list` and `lsp/status` are NOT L2 methods in this SDK — the earlier TODO
listed them speculatively. MCP and LSP are reachable as tools, not as L2 status
calls. `trajectory/list` and `deliverables/list` likewise do not exist, so both
panels derive from the session event stream.

## Phase 4 — Power features ✅

All mounted and booting. `node scripts/boot-test.mjs` is the check.

- [x] Sandbox — `dsh-sandbox-local` + `dsh-sandbox-policy`; `dsh-fs-sandbox` and
      `dsh-bash-sandbox` REPLACE the local fs/bash backends rather than layering
      over them. Default mode `workspace-write` (the plugin default is
      `read-only`, which stops the agent writing at all).
- [x] Permission presets — adds the `/permission` command. Requires a confining
      `ctx.shell`, so it must load after the sandbox.
- [x] PTY terminal — `dsh-terminal` + `dsh-terminal-bash` + `dsh-tool-terminal`.
- [x] Schedule — `dsh-schedule`.
- [x] LSP — `dsh-lsp` + `dsh-lsp-stdio` (typescript-language-server) +
      `dsh-tool-lsp`.
- [x] Hooks — `dsh-hooks-claude-code`, reading `<workspace>/.claude/settings.json`.
      `dsh-hook-protocol` is types-only and must NOT be mounted as a plugin.
- [x] Code mode — `dsh-code-runtime-worker-thread` registers `ctx.codeRuntime`;
      the base `dsh-code-runtime` must not also be mounted.
- [x] Session search — `dsh-tool-session-query`. The index was already mounted
      but configured `openAt: never`, which refuses every search.
- [x] MCP — `dsh-mcp-client` mounted for **context7** over stdio
      (`npx -y @upstash/context7-mcp`), adding `mcp__context7__query-docs` and
      `mcp__context7__resolve-library-id`. Verified live: the model resolved a
      library id and quoted real docs with a source link. `failOnStartupError`
      is false, so a network hiccup degrades to "no context7 tools" rather than
      blocking boot. Add more servers by copying the row.
- [x] Agent presets — three named by the KIND OF WORK, in `.dsh/presets/`:
      `build` (main worker), `research` (light, fast), `verify` (second
      opinion, deliberately routed to a different model family so it is not the
      same model marking its own homework). Each preset's `agent.cordis.yml`
      picks its own route, which is the knob to retune.

## Phase 6 — Everything else the backend supports ✅

- [x] External subagent backends — `dsh-subagent-claude-code` and
      `dsh-subagent-codex`, exposed as the `claude_code` and `codex` tools.
      A child is a genuinely different agent, not another instance of this one.
      Both need `maxDepth: provider-managed`: an external CLI exposes no
      depthLimit capability, and the tool refuses to load without it.
      Verified live — the delegated Claude Code agent replied `ok`.
- [x] Codex-format hooks (`dsh-hooks-codex`) alongside the Claude-Code bridge.
- [x] Session log export (`dsh-session-log-export`) — adds `/export`.
- [x] Bundled skill provider (`dsh-skill-badge`).

Deliberately not mounted, with reasons:

- `dsh-subagent-dsh-sdk` — a full out-of-process harness per child. Works, but
  needs a `command` pointing at a second runtime; no use case here yet.
- `dsh-subagent-acp` — needs an ACP agent to talk to.
- `dsh-web-search-exa`, `dsh-web-search-perplexity` — no API keys present.
- `dsh-tool-pwsh`, `dsh-pwsh-*`, `dsh-sandbox-windows-acl` — Windows only.
- `dsh-tool-cordis` — ships in no tree by design (dynamic code reaches the
  real runtime).
- `dsh-tool-bash-persistent` — superseded by the terminal tools; it would also
  collide with `bash`.
- `dsh-fs-local`, `dsh-bash-local` — replaced by their sandbox equivalents.
- `dsh-hook-protocol`, `dsh-jobs`, `dsh-shell`, `dsh-code-runtime`,
  `dsh-sandbox` — types-only or abstract bases; mounting them fails.

## Phase 5 — Parity sweep

- [x] Cross-check `known-event-types.ts` — now a permanent test, not an audit.
- [x] Cross-check `docs/tool-catalog.md` — 21/24 packages reachable, 43 tools.
      Remaining 3 are deliberate: `pwsh` (Windows), `cordis_*` (in no shipped
      tree), `tool-bash-persistent` (superseded by the terminal tools).
- [x] Update README command/key tables and `.env.example`.
- [x] Live end-to-end against `local-llm-router/router`. The model drove
      terminal_open → terminal_send → terminal_read → terminal_close and
      reported real output (`Darwin`, workspace path); ran `run_code` (42);
      `session_search` (63 sessions); and hit the sandbox refusal on a `$HOME`
      write, which offered an escalation. Trajectory, deliverables and the
      skill picker were rendered and checked on screen.
- [x] Subagents — parent delegated, child read TODO.md and reported back, parent
      verified the count independently.
- [x] Plan → execute — `/plan` raised the banner, the model presented a plan
      through `exit_plan_mode`, approval exited plan mode and it carried the
      work out (the test edit was reverted).
- [x] `/compact` — "Compacted 36 history items (~13911 tokens)"; the trajectory
      shows both the `command/run` and `compaction/summary` lines.
- [x] `/sessions` resume — resumed across a real quit/relaunch with history and
      token counts intact, and answered a follow-up from restored context
      without re-reading files.

Note: resume REFUSES a session that never reached the model, reporting
`route (missing)/(missing)`. That is correct — the route is recovered from
`request/header` events, and a session with none has no route to restore. It is
not a bug, but the message could name the reason.

## Verification status

| Check                                   | Status                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| `tsc --noEmit`                          | ✅ pass                                                |
| `bun test` (40 tests)                   | ✅ pass                                                |
| `bun build`                             | ✅ pass                                                |
| `scripts/boot-test.mjs`                 | ✅ pass — 4 commands (compact, goal, permission, plan) |
| `scripts/l2-probe.mjs`                  | ✅ skills/settings/presets OK                          |
| `scripts/settings-roundtrip.mjs`        | ✅ pass                                                |
| `eslint src`                            | ✅ 0 errors (2 pre-existing warnings)                  |
| `eslint scripts`                        | ⚠️ 17 pre-existing errors, unrelated to this work      |
| Live pty: goal / workflow / settings    | ✅ verified earlier                                    |
| Live pty: everything mounted in Phase 4 | ⏳ needs a working model                               |

## Known issues

- `src/useHarness.ts` capped output at a hardcoded `16_384`, overriding
  `maxTokens: 49152` on the `local-llm-router` route. Now `DSH_MAX_TOKENS`.
- `local-llm-router` runs at `reasoning: xhigh` by design — the served template
  accepts exactly `low`/`medium`/`xhigh` and defaults to `xhigh`, which is why
  the route maps `high` → `xhigh`. It is NOT a misconfiguration. It does mean
  long reasoning turns are the norm, so set `DSH_MAX_TOKENS=49152` (the route's
  declared ceiling) when using it, or turns die at the 16384 default.
- `llama-server` on localhost runs `--parallel 1`, so one wedged request blocks
  every client until it clears.
- 17 pre-existing eslint errors under `scripts/` (ANSI-escape regexes in the
  pty tests, an unused import). They became visible only when the eslint config
  was fixed to cover `.mjs` at all.
