# DeepSeek TUI → Full Harness Feature Gap Analysis

Goal: make the TUI expose **all** DeepSeek Harness functionality, not just the
20 plugins currently wired in `cordis.yml`.

This document is the result of reading both repos:
- Harness: `~/git/deepseek-harness` (the `dsh-base` bundle = the reference
  "complete" composition; `docs/tool-catalog.md`; `packages/core/session/src/known-event-types.ts`)
- TUI: `~/git/deepseek-tui` (`cordis.yml`, `src/useHarness.ts`, `src/commands.ts`,
  the SDK protocol in `packages/sdk/protocol/src/types.ts`)

---

## 1. The architecture in one paragraph

The TUI is a **thin client**. It spawns the harness as a subprocess and talks to
it over stdio JSON-RPC (`@deepseek-ai/dsh-sdk-client` → `HarnessClient`). The
harness side is composed by the TUI's own `cordis.yml` (20 plugin rows) on top of
the `agent-spine-demo` bundle. Every durable session event is streamed back to the
TUI as a `session.event` notification, and the TUI already has a **generic
slash-command passthrough** (`command/list` + `command/execute`).

That last fact is the key to the whole effort: **most harness features can be
exposed without any new wire protocol**, because (a) their *state* already flows
through `session.event`, and (b) their *actions* are slash commands the TUI can
already discover and execute. Only a handful of features need new JSON-RPC
methods (catalogs / request-response UIs).

So "implement all harness functionality" decomposes into **three layers**:

| Layer | Where | What it means |
|---|---|---|
| **L1 — Composition** | `cordis.yml` | Add/enable the harness plugin so the capability exists server-side. |
| **L2 — Wire** | `packages/sdk/protocol` + `sdk/server` + `sdk/client` | New JSON-RPC methods/notifications, only where a feature needs request/response (catalogs, settings, feedback, MCP). |
| **L3 — UI** | `deepseek-tui/src/*` | Render new `session.event` types in `processEvent`; add overlays/panels/pickers; wire new local commands. |

A feature is "complete" when all the layers it needs are done. Many features are
**L1-only** (the model gets a new tool; the TUI already renders `tool/call` +
`tool/result` generically via `ToolCard`).

---

## 2. Current state (what is wired today)

### 2.1 The 20 `cordis.yml` rows

1. `sdk-jsonrpc-server` — the RPC bridge itself
2. `attachment-local` — durable image attachments
3. `settings-file` — `providers.yaml` hot-reload
4. `llm-pi-ai` — 38 provider routes
5. `commands` — slash-command registry
6. `user-approval` — approval policy (`ask`)
7. `user-questions` — `ask_user_question` backend
8. `subprocess-local` — `ctx.subprocess`
9. `bash-local` — one-shot bash executor
10. `agent-spine-demo` — the bundle (see 2.2)
11. `session-persistence-jsonl` — durable session log
12. `session-checkpoint-policy` — durability checkpoints
13. `session-query-sqlite` — session list/history (`:memory:`, `openAt: never`)
14. `tool-ask-user` — `ask_user_question` tool
15. `fs-local` — `ctx.fs`
16. `fs-observation-policy` — read-before-write gate
17. `tool-fs` — `read`/`write`/`edit`/`read_image`
18. `token-meter` — usage accounting
19. `compaction-basic` — auto-compaction
20. `command-compact` — `/compact`

### 2.2 What `agent-spine-demo` already bundles (but the TUI disables)

The spine imports and can mount: `llm`, `session`, `session-title` (fallback),
`system-prompt`, `tools`, `skill`, `skill-filesystem`, `agent`, `goal` +
`goal-round-driver` + `tool-goal` (opt-in), `jobs-local`, `invariants`,
`tool-bash`, `shell-env`, `agent-instructions`, `tool-skill`, `tool-jobs`,
`agent-loop`, `llm-retry`.

The TUI's `cordis.yml` currently **turns most of the interesting ones off**:

| Spine capability | TUI config today | Effect |
|---|---|---|
| `skills` | `enabled: false` | No skill registry / `skill` tool |
| `toolJobs` | `false` | No `job_*` tools |
| `toolBash.enableRunInBackground` | `false` | No background bash |
| `goals` | *(omitted)* | Goal domain + `tool-goal` not mounted |

So a large slice of "missing" features is actually **already in the process, just
switched off**. Enabling them is the cheapest win available.

### 2.3 What the TUI UI renders today

`processEvent` (in `useHarness.ts`) handles exactly: `user/message`,
`assistant/chunk`, `assistant/message`, `tool/call`, `tool/result`, `turn/end`,
and `todo/write` (rendered as a flat status line). Local commands: `help status
model models provider reasoning new sessions attach unattach clear cancel compact
search copy shell theme quit`. Overlays: auth, control, interaction (approval +
questions), pickers (model/provider/reasoning/theme/sessions), search.

The full session-event vocabulary the harness can emit (`known-event-types.ts`)
is 45 types. The TUI interprets ~7. The rest are silently dropped.

---

## 3. The gap, feature by feature

Legend — **L1** add/enable plugin in `cordis.yml`; **L2** new JSON-RPC method;
**L3** new TUI rendering/overlay. Effort: S (< ~1 day), M (1–3 days), L (> 3 days).

### 3.1 Model-facing tools (agent capabilities)

These are the biggest capability gaps for a coding agent. Almost all are **L1 +
optional L3** (the generic `ToolCard` already renders them).

| Feature | Package(s) | Layers | Effort | Notes |
|---|---|---|---|---|
| **glob / grep** | `tool-fs-search` | L1 | S | Spawns packaged ripgrep via `ctx.subprocess` (already wired). Highest value-per-effort. |
| **todo_write** | `tool-todo` | L1 + L3 | S–M | TUI already parses `todo/write`; upgrade the flat status line to a live checklist panel. |
| **str_replace_editor** | `tool-str-replace-editor` | L1 | S | Alternate editor; composes with existing `ctx.fs`. |
| **web_search** | `web` + `web-search-deepseek` + `tool-web` | L1 | S–M | Needs `DEEPSEEK_API_KEY` (or another search provider). `fetch` stays off. |
| **subagents** | `subagent` + `subagent-spawn-in-process` + `subagent-fork-in-process` + `tool-subagent` (×2) + `tool-subagent-control` + `tool-subagent-control/list-agents` + `tool-subagent-report` | L1 + L3 | M–L | `subagent.started`/`subagent.finished` are **already in the protocol**. Add a subagents panel (running children, open child session). |
| **background jobs** | enable spine `toolJobs` + `toolBash.enableRunInBackground` | L1 + L3 | M | `job_list`/`job_output`/`job_kill` tools; add a jobs panel. |
| **skills** | enable spine `skills` | L1 + L2 + L3 | M | Needs a `skills/list` catalog method (web uses `ctx.remote.api.skills`) + a skill picker. |
| **goals** | enable spine `goals` + `command-goal` | L1 + L3 | M | `/goal` command already registers; `goal/change` events flow; add a goal panel. |
| **plan mode** | `plan-mode` | L1 + L3 | M | `/plan` command + `exit_plan_mode` tool + `plan/mode` events. Add a plan banner + approval surface. High value. |
| **workflow** | `workflow-worker-thread` + `tool-workflow` | L1 + L3 | M | `tool-workflow/run-*` + `agent-*` events; add a run view. |
| **ralph** | `tool-ralph` | L1 | S | Fixed fresh-agent iteration loop; renders as a tool. |
| **terminal (PTY)** | `terminal` + `terminal-bash` + `tool-terminal` | L1 + L3 | M–L | Six `terminal_*` tools; add a terminal panel. |
| **LSP** | `lsp` + `lsp-stdio` + `tool-lsp` | L1 + L2 + L3 | M | `lsp` tool + a status surface; needs a registered provider. |
| **MCP** | `mcp-client` | L1 + L2 + L3 | M–L | MCP servers bring arbitrary tools; needs `mcp/list|add|remove` + a management UI. |
| **session-query tools** | `tool-session-query` | L1 | S | Five read-only `session_*` tools for the model. |
| **schedule** | `schedule` | L1 + L3 | M | `schedule_*` tools + `schedule/change` events; add a schedule list. |
| **code mode** | `code-runtime` (+ `code-runtime-worker-thread`) | L1 + L3 | M | `run_code` tool under `tools.mode: code`; add a code-dispatch view. |
| **hooks** | `hooks-claude-code` / `hooks-codex` | L1 | S | `hook/invoked` + `hook/result` events; optional. |

### 3.2 Agent behavior / policy (mostly L1-only, little or no UI)

These make the agent more robust; the TUI needs at most a status line.

| Feature | Package(s) | Layers | Effort | Notes |
|---|---|---|---|---|
| **tool-result pruner** | `compaction-tool-result-pruner` | L1 | S | Compacts oversized tool results before the main compactor. |
| **spill** | `spill-local` + `spill-policy` | L1 | S | Durable overflow for large outputs (pairs with `tool-fs-search` caps). |
| **tool-call timeout** | `timeout-policy` (guard) | L1 | S | Enforced deadlines on tool calls. |
| **repeat-tool reminder** | `repeat-tool-reminder` (guard) | L1 | S | Nudges the model out of loops. |
| **sandbox + permission presets** | `sandbox-local` + `sandbox-policy` + `bash-sandbox` + `permission-presets` | L1 + L3 | M | Replaces plain `bash-local` with a sandboxed executor; `sandbox/mode` + `permission/preset` events; add a permission-mode picker (read-only / workspace-write / danger-full-access). |
| **LLM session titles** | `session-title-llm` (`session-title-first-prompt-llm`) | L1 | S | Better `/sessions` titles; `session/title-llm-request` event. |
| **session projection** | `session-projection` | L1 | S | Required for `list_agents` (subagents) and plan/goal unit state. |
| **managed credentials** | `credentials-local` | L1 | S | `$DSH_HOME/.credentials.yaml` store; complements the TUI's own `auth.json`. |
| **default model** | `agent-default-model` | L1 | S | Saved default route for new sessions. |
| **native DeepSeek adapter** | `llm-deepseek` | L1 | S | The TUI currently reaches DeepSeek through the `llm-pi-ai` route; add the native adapter for parity. |
| **telemetry** | `session-telemetry-otel` | L1 | S | Off by default (`DSH_TELEMETRY_MODE`); optional. |
| **agent presets / persona** | `preset/agent-presets` + `preset/persona` | L1 + L3 | S–M | `agent-preset/selected` event; add a preset picker. |

### 3.3 TUI-only UI surfaces (L3, mirror the web `ui-*` modules)

The web client ships 28 `ui-*` modules. The TUI has rough equivalents for
conversation, tool, attachment, model-selection, theme, user-questions, commands.
Missing surfaces, mapped to the web module they would mirror:

| TUI surface | Mirrors | Depends on | Effort |
|---|---|---|---|
| Goal panel | `ui-goal` | §3.1 goals | M |
| Jobs panel | `ui-jobs` | §3.1 background jobs | M |
| Subagents panel | `ui-subagent` | §3.1 subagents | M |
| Plan banner + approval | `ui-plan` | §3.1 plan mode | M |
| Skill picker | `ui-skill` | §3.1 skills (+ L2) | M |
| Workflow run view | `ui-workflow-run` | §3.1 workflow | M |
| Message feedback (👍/👎) | `ui-message-feedback` | `command-feedback` (+ L2 `feedback/record`) | S–M |
| Permission-mode picker | `ui-permission-presets` | §3.2 sandbox | S |
| Settings (general/models/plugins) | `ui-settings*` | L2 `settings/get|set` | M–L |
| Trajectory view | `ui-trajectory` | session events | M |
| Deliverables | `ui-deliverables` | session events | S–M |
| Agent-preset picker | `ui-agent-preset` | §3.2 presets | S |
| Directory picker | `ui-directory-picker-*` | `ctx.fs` | S |
| Input triggers (`@` mentions) | `ui-input-trigger` | subagents/skills | S–M |

### 3.4 New wire protocol (L2) — the small set that actually needs it

Everything else rides on `session.event` + `command/execute`. The features that
genuinely need a new request/response method:

| Method(s) | For | Why events/commands aren't enough |
|---|---|---|
| `skills/list` | skill picker | Catalog is a query, not a session event. |
| `feedback/record` | message feedback | Write path keyed to a message id. |
| `settings/get` + `settings/set` | settings UI | Read/write the settings document. |
| `mcp/list` + `mcp/add` + `mcp/remove` | MCP management | Server lifecycle is request/response. |
| `lsp/status` | LSP surface | Provider/server health query. |
| `agent-presets/list` | preset picker | Catalog query. |

Optional (can be deferred or done via `command/execute`): `jobs/list|kill|output`,
`subagents/list`, `goals/list` — all of these also exist as model tools and slash
commands, so the UI can start by rendering events and add RPC later.

---

## 4. Phased implementation plan

Ordered by value-per-effort. Each phase ends with a smoke test: launch the TUI,
exercise the new feature, confirm the event renders and the action works.

### Phase 0 — Baseline (do first)
- [ ] Confirm `pnpm install && pnpm run typecheck && pnpm run build` in the TUI.
- [ ] Smoke-run one full turn against the harness.
- [ ] Tag a `pre-feature-parity` checkpoint.

### Phase 1 — Cheap capability wins (L1-only + enable-the-spine) ✅ DONE
The single highest-leverage phase. No new protocol, minimal UI.
- [x] `tool-fs-search` (glob/grep) — **the** missing coding primitive.
- [x] `tool-todo` + upgrade `todo/write` rendering to a live checklist.
- [x] `tool-str-replace-editor`.
- [x] Enable spine `skills` (registry + `skill` tool) — defer the picker to Phase 3.
- [x] Enable spine `goals` + `command-goal` — `/goal` works via existing passthrough.
- [x] `plan-mode` — `/plan` + `exit_plan_mode`; add a plan banner (L3, small).
- [x] Policy set: `compaction-tool-result-pruner`, `spill-local`+`spill-policy`,
      `timeout-policy`, `repeat-tool-reminder`, `session-projection`.
- [x] `session-title-llm`, `agent-default-model`, `credentials-local`, `llm-deepseek`.
- **VERIFY:** ✅ glob (1571 files, spill kicked in) + todo (live checklist panel) +
  plan (banner renders) + goal (`/goal` registered) all verified live; typecheck,
  build, 30 unit tests, and boot test all green.

### Phase 2 — Subagents, jobs, web (L1 + L3 panels) ✅
- [x] Subagent stack (spawn + fork in-process, control, report) + subagents panel.
- [x] Background jobs (enable `toolJobs` + `enableRunInBackground`) + jobs panel.
- [x] `web` + `web-search-deepseek` + `tool-web` (gated on `DEEPSEEK_API_KEY`).
- [x] `tool-ralph`.
- **VERIFY (done):** `subagent` tool started a background child (id returned);
  background bash job `bash-1` completed with output; `web_search` registered and
  callable (auth-gated on `DEEPSEEK_API_KEY`); `ralph` ran a fixed loop to goal.
  Live pty test confirmed the subagents panel (`✓ probe`) and jobs panel
  (`✓ bash-1 [bash] …`) render. 31 unit tests + typecheck + build + boot green.

### Phase 3 — Richer UI + the L2 protocol additions
- [ ] Protocol: `skills/list`, `feedback/record`, `settings/get|set`,
      `agent-presets/list` (and `mcp/*`, `lsp/status` if those land now).
- [ ] Skill picker, message feedback, agent-preset picker, directory picker.
- [ ] Settings overlay (general + models first; plugins inventory later).
- [x] Goal panel (driven by `goal/change` events; `tool-goal` mounted).
- [x] Workflow run view (driven by `tool-workflow/*` events; `tool-workflow` mounted).
- [ ] Trajectory view, deliverables.
- **VERIFY (partial):** goal + workflow panels render live with real events.

### Phase 4 — Power features (L1 + L2 + L3)
- [ ] Sandbox + permission presets + permission-mode picker.
- [ ] MCP client + management UI.
- [ ] LSP + status surface.
- [ ] Terminal (PTY) + terminal panel.
- [ ] Schedule + schedule list.
- [ ] Code mode (`run_code`) + code-dispatch view.
- [ ] Hooks (claude-code / codex) — optional.
- **VERIFY:** sandboxed bash, an MCP tool call, a PTY session, a scheduled run.

### Phase 5 — Parity sweep + hardening
- [ ] Cross-check `known-event-types.ts` (45 types) against `processEvent`; render
      or explicitly mark-ignorable every type the composition can now emit.
- [ ] Cross-check `docs/tool-catalog.md` against the mounted tools; every shipped
      tool the composition loads should be reachable.
- [ ] Update `README.md` command/key tables; update `.env.example` for new creds
      (`DEEPSEEK_API_KEY` for search, etc.).
- [ ] Full end-to-end: multi-turn with tools, subagent, plan→execute, `/compact`,
      `/sessions` resume, clean shutdown.
- **VERIFY:** a feature matrix (below) is fully green.

---

## 5. Feature-parity checklist (definition of "complete")

A TUI is "complete" when every row is green. "Reachable" = the model can call it
(L1 done). "Visible" = the TUI renders its state (L3 done). "Controllable" = the
user can drive it (command or L2 method).

| Capability | Reachable (L1) | Visible (L3) | Controllable |
|---|---|---|---|
| read / write / edit / read_image | ✅ | ✅ | ✅ |
| glob / grep | ☐ | ☐ (generic) | ☐ |
| bash (one-shot) | ✅ | ✅ | ✅ |
| bash (background) + job_* | ✅ | ✅ (jobs panel) | ☐ |
| str_replace_editor | ☐ | ☐ (generic) | ☐ |
| todo_write | ✅ | ✅ (todo panel) | ☐ |
| ask_user_question | ✅ | ✅ | ✅ |
| subagent / subagent_fork | ✅ | ✅ (subagents panel) | ☐ |
| skill | ☐ | ☐ | ☐ |
| goal (create/update/…) | ☐ | ☐ | ☐ (`/goal`) |
| plan mode + exit_plan_mode | ✅ | ✅ (banner) | ✅ (`/plan`) |
| web_search | ✅ | ☐ (generic) | ☐ |
| workflow / ralph | ✅ | ☐ (generic) | ☐ |
| terminal_* (PTY) | ☐ | ☐ | ☐ |
| lsp | ☐ | ☐ | ☐ |
| mcp tools | ☐ | ☐ | ☐ |
| session_* query tools | ☐ | ☐ (generic) | ☐ |
| schedule_* | ☐ | ☐ | ☐ |
| run_code (code mode) | ☐ | ☐ | ☐ |
| feedback | ☐ | ☐ | ☐ |
| sandbox + permission presets | ☐ | ☐ | ☐ |
| agent presets | ☐ | ☐ | ☐ |
| settings (models/plugins) | ☐ | ☐ | ☐ |

---

## 6. Key decisions / risks

1. **Spine vs. base bundle.** The TUI builds on `agent-spine-demo`; the reference
   "complete" composition is the `dsh-base` bundle. Two options:
   - **(a) Keep the spine, add rows** to `cordis.yml` for everything the spine
     doesn't bundle (recommended — smaller diff, the spine already owns
     goal/jobs/skills/bash/loop).
   - **(b) Switch to `dsh-base`** and drop the spine — larger diff, but exact
     parity with the shipped product and its defaults.
   Recommend **(a)** for Phases 1–3, revisit **(b)** only if parity drifts.

2. **Protocol surface stays small.** Resist adding RPC methods for anything that
   can be a slash command + session event. The generic `command/execute` is the
   escape hatch. Target ≤ 6 new methods total (§3.4).

3. **`session-query` is `:memory:` + `openAt: never`.** Full-text search is off.
   If `tool-session-query` or the web-style search is wanted, flip `openAt` to
   `first-search` and give it a durable `path`. Decide in Phase 1.

4. **Sandbox changes the bash path.** Moving from `bash-local` to
   `bash-sandbox` + `sandbox-policy` changes approval behavior (fresh sessions pin
   `workspace-write` + `ask`). The TUI's "bash doesn't ask by default" note in the
   README would need updating. Sequence this in Phase 4, not Phase 1.

5. **Bun vs. pnpm** (carried from `MERGE_PLAN.md`): the TUI builds with Bun inside
   a pnpm workspace; if the resolver chokes, normalize the TUI to `node`/`tsdown`.

6. **`!!js` env contract** in `cordis.yml` (`DSH_CWD`, `DSH_SESSION_ROOT`,
   `DSH_PI_AI_AUTH_PATH`, `DSH_PROVIDER`, `DSH_MODEL`) must stay intact when rows
   are added.

7. **Secrets.** New creds (e.g. `DEEPSEEK_API_KEY` for search) follow the existing
   pattern: env or the managed store, never inlined in `cordis.yml` or chat text.

---

## Appendix — source references

- Reference composition: `deepseek-harness/packages/bundle/base/cordis.patch.yml`
- Tool catalog: `deepseek-harness/docs/tool-catalog.md`
- Event vocabulary: `deepseek-harness/packages/core/session/src/known-event-types.ts`
- Spine bundle: `deepseek-harness/packages/examples/agent-spine-demo/src/index.ts`
- Wire protocol: `deepseek-harness/packages/sdk/protocol/src/types.ts`
- TUI composition: `deepseek-tui/cordis.yml`
- TUI event handling: `deepseek-tui/src/useHarness.ts` (`processEvent`)
- TUI commands: `deepseek-tui/src/commands.ts`
