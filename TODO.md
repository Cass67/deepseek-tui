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

- [x] Goal panel (driven by `goal/change` events; `tool-goal` mounted)
- [x] Workflow run view (driven by `tool-workflow/*` events; `tool-workflow` mounted)
- [x] Settings overlay (Ctrl+S; model, reasoning, theme, session, shortcuts)
- [x] Feedback tracking (`feedback/record` events → state)
- [x] Message feedback UI (FeedbackPanel renders `feedback/record` entries)
- [x] Skill picker (`SkillPicker` via `harness.listSkills`)
- [x] Agent-preset picker (`harness.listAgentPresets`)
- [x] Directory picker (`DirectoryPicker.tsx`, local state)
- [x] Trajectory view (`TrajectoryPanel.tsx`, fed by `trajectorySummary`)
- [x] Deliverables panel (`DeliverablesPanel.tsx`, fed by `deliverableForToolCall`)
- [x] L2 protocol additions — **no harness work was needed**; these already ship
      in `@deepseek-ai/dsh-sdk-client` + `dsh-sdk-jsonrpc-server`. Verified live
      with `scripts/l2-probe.mjs`:
  - [x] `skills/list` — returns `{"skills":[]}`
  - [x] `settings/get` / `settings/set` — round-trip verified by
        `scripts/settings-roundtrip.mjs` (revision advances, read-back matches)
  - [x] `agent-presets/list` — returns `{"presets":[]}`
  - [ ] `mcp/*` — not in this SDK build (`unknown ... runtime method`); Phase 4
  - [ ] `lsp/status` — not in this SDK build; Phase 4

Note: `trajectory/list` and `deliverables/list` do not exist as L2 methods, so
both panels are derived from the session event stream instead.

## Phase 4 — Power features (not started)

- [ ] Sandbox (L1)
- [ ] MCP client (L2)
- [ ] LSP integration (L3)
- [ ] PTY terminal
- [ ] Schedule / cron
- [ ] Code mode
- [ ] Hooks

## Phase 5 — Parity sweep (not started)

- [ ] Cross-check `known-event-types.ts` (45 types)
- [ ] Cross-check docs/tool-catalog.md
- [ ] Update README / .env.example
- [ ] Full E2E testing

## Verification status

| Check                                              | Status                                        |
| -------------------------------------------------- | --------------------------------------------- |
| `tsc --noEmit`                                     | ✅ pass                                       |
| `bun test` (39 tests)                              | ✅ pass                                       |
| `bun build`                                        | ✅ pass                                       |
| Boot test                                          | ✅ pass                                       |
| L2 probe (`scripts/l2-probe.mjs`)                  | ✅ skills/settings/presets OK                 |
| `settings/set` round-trip                          | ✅ verified                                   |
| Live pty: goal panel                               | ✅ verified                                   |
| Live pty: workflow panel                           | ✅ verified                                   |
| Live pty: settings overlay                         | ✅ verified                                   |
| Live pty: feedback panel                           | ⏳ blocked — localhost slot wedged on task 416391 |
| Live pty: new panels (dir/trajectory/deliverables) | ⏳ blocked — same                             |

## Known issues

- `src/useHarness.ts` capped output at a hardcoded `16_384`, silently overriding
  `maxTokens: 49152` on the `local-llm-router` route in `cordis.yml`. Long
  reasoning turns died with `stopReason: "length"`. Now `DSH_MAX_TOKENS`.
- `cordis.yml` sets `reasoning: xhigh` for `local-llm-router`, but the router
  only advertises `low`/`medium`/`high`.
- `llama-server` on localhost runs `--parallel 1`, so one wedged request blocks
  every client until it clears.
