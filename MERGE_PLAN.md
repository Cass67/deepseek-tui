# DeepSeek Harness + TUI → One App: Report, Plan, TODO

Goal: a single repo that is **harness (agent runtime) + TUI (terminal client)**,
with **no web server, no web UI, no website, no Python, no native, no runnable
examples, no docs site**.

---

## 1. Report

### 1.1 What each repo is

**`deepseek-tui`** (current workspace, `/Users/cass/git/deepseek-tui`)

- Standalone **Bun + React 19 + OpenTUI** terminal chat client.
- ~45 source files in `src/` (`App.tsx`, `useHarness.ts` [45 KB], `InputBar.tsx`,
  `theme.tsx`, overlays, pickers, …).
- Launches the harness as a **subprocess** over **stdio JSON-RPC**.
- Depends on **29 harness packages via `link:`** (pointing at
  `../deepseek-harness/...`) + 3 external deps (`@opentui/core`,
  `@opentui/react`, `react`).
- Ships its own `cordis.yml` that composes the harness runtime for the subprocess.

**`deepseek-harness`** (`/Users/cass/git/deepseek-harness`)

- **pnpm monorepo** — "everything is a plugin" on vendored Cordis.
- **240 indexed npm packages** across `packages/*/*`, `vendor/*`, `apps/*`,
  `native/*`, `python/*`, `examples/*`.
- Two product apps: `apps/cli` (the `dsh` bin) and `apps/web` (the Web UI).
- Heavy infra: **149** gate/generator scripts, **62** docs, VitePress website,
  Python SDK, native landlock launcher.

### 1.2 The architecture (the key fact)

The TUI and harness are **already decoupled**: the TUI spawns the harness as a
child process and talks to it over stdio JSON-RPC. There is no in-process
coupling to untangle.

```
deepseek-tui  (Bun + React + OpenTUI)  ── HarnessClient (dsh-sdk-client)
   │  spawns (node …/dsh-sdk-jsonrpc-demo/lib/bin.js)
   ▼
dsh-jsonrpc-agent  (packages/examples/jsonrpc-demo)
   │  boots  (dsh-app-boot → cordis)
   ▼
cordis.yml  (the TUI's own composition, ~20 plugins)
   │  loads
   ▼
harness runtime  (agent-loop, tools, session, llm, fs, shell, …)
```

- TUI = **client** (`@deepseek-ai/dsh-sdk-client` → `HarnessClient`).
- Harness = **server** (`@deepseek-ai/dsh-sdk-jsonrpc-server`), booted by the
  `jsonrpc-demo` bin from the TUI's `cordis.yml`.
- "Merge into one app" therefore = **one repo containing both the harness
  runtime packages and the TUI**, with the TUI still spawning the harness as a
  subprocess.

### 1.3 Keep vs. rip (the numbers)

Transitive dependency closure of the TUI's 29 harness deps
(`dependencies` + `peerDependencies`, then `+ devDependencies`):

| Set                 | Packages | Meaning                                                           |
| ------------------- | -------- | ----------------------------------------------------------------- |
| **Runtime closure** | **82**   | Everything needed to _run_ the TUI                                |
| **Dev closure**     | **93**   | Runtime + devDeps needed to _run the test suite_ of kept packages |
| **Rip out**         | **147**  | Everything else (240 − 93)                                        |

The **11 dev-only additions** (tests, not runtime):
`agent-loop-testkit`, `bash-sandbox`, `fs-sandbox`, `llm-mock-server`,
`loader-smoke`, `pwsh-local`, `sandbox-local`, `sandbox-windows-acl`,
`session-persistence-sqlite`, `typert-registry`, `node-addon-landlock-run`.

**The 82-package runtime closure** (the actual "harness" the TUI needs), by group:

- **core (6):** agent, agent-loop, scope, session, system-prompt, tools
- **llm (5):** llm, llm-deepseek, llm-pi-ai, llm-retry, token-meter
- **session (6):** persistence, persistence-jsonl, projection,
  projection-cache, title, checkpoint-policy
- **session-query (2):** session-query, session-query-sqlite
- **fs (4):** fs, fs-local, fs-observation-policy, tool-fs
- **shell (4):** shell, shell-env, bash-local, tool-bash
- **subprocess (2):** subprocess, subprocess-local
- **compaction (4):** compaction, compaction-basic,
  compaction-tool-result-pruner, command-compact
- **interaction (4):** commands, tool-ask-user, user-approval, user-questions
- **attachment (2):** attachment, attachment-local
- **sdk (3):** sdk-client, sdk-jsonrpc-server, sdk-protocol
- **settings (2):** settings, settings-file
- **subagent (1):** subagent
- **skill (3):** skill, skill-filesystem, tool-skill
- **goal (3):** goal, goal-round-driver, tool-goal
- **jobs (3):** jobs, jobs-local, tool-jobs
- **context (1):** agent-instructions
- **credentials (1):** credentials
- **identity (1):** anonymous-user-id
- **preset (1):** agent-presets
- **sandbox (2):** sandbox, sandbox-policy
- **storage (2):** storage, storage-domain
- **code-runtime (1):** code-runtime
- **boot (1):** app-boot
- **runtime-diagnostics (1):** invariants
- **typert (1):** typert-protocol
- **util (6):** atomic-write, brand, home-paths, launch-environment,
  output-retention, timeout
- **examples (2):** agent-spine-demo, sdk-jsonrpc-demo ← the two "demo"
  packages that are _actually the runtime_
- **vendor (8):** cordis, cosmokit, schemastery,
  cordis-plugin-{group,hmr,include,loader,timer}

### 1.4 The cruft (what to rip out)

**Web stack — ~201,000 LOC, ~62 packages:**

| Area                      | LOC      | Packages                         |
| ------------------------- | -------- | -------------------------------- |
| `packages/client`         | ~138,651 | 39                               |
| `packages/host`           | ~22,387  | 8                                |
| `apps/web`                | ~20,273  | 1                                |
| `packages/typert`         | ~14,561  | 11 (keep only `typert-protocol`) |
| `packages/api`            | ~4,415   | 2                                |
| `packages/bundle/web-app` | ~701     | 1                                |

**Other non-package cruft:**

- `scripts/` — 149 gate/generator files (many web/docs/translation-specific)
- `docs/` — 62 files
- `website/` — VitePress docs site
- `python/` — Python SDK + bundled runtime
- `native/` — landlock-run native launcher
- `examples/` — 8 runnable demo leaves (acp-agent, headless-agent,
  jsonrpc-agent, mcp-memory, web-cordis, web-schedule)
- `apps/cli` — the `dsh` bin (profile boot, plugin mgmt, web alias) —
  **not used by the TUI**

**Other ripped package groups** (not in the closure): acp, e2b, lsp, mcp,
terminal, web, workflow, spill, hooks, todo, plan, schedule, workspace,
feedback, guard, extensions, most subagent providers, most session variants,
most shell variants, most test-support, bundle (base/headless/web-app).

### 1.5 Key decision points

1. **Base repo** — Use `deepseek-harness` as the base, prune it, add the TUI as
   `apps/tui`. _(Recommended: it already has the monorepo infra.)_
2. **Harness entry point** — Keep the `jsonrpc-demo` bin (rename to e.g.
   `dsh-agent`). **Drop `apps/cli`** + the `dsh-base`/`dsh-headless`/
   `dsh-web-app` bundles (web-coupled, not needed). _If you want a standalone
   headless `dsh` CLI, keep a trimmed `apps/cli` instead._
3. **Keep 82 (runtime) or 93 (dev) packages?** — Recommend **93** so the test
   suite runs.
4. **Package manager** — Keep **pnpm** as the workspace manager; the TUI can
   still use Bun for dev/build. _(Or normalize the TUI to Node.)_
5. **Rename the "demo" packages?** — `agent-spine-demo` and `jsonrpc-demo` are
   the real runtime but live in `packages/examples/`. Optional: relocate to
   `packages/runtime/` or rename. _(Low priority.)_

---

## 2. Plan

**End state:** a single repo (`deepseek-harness`, pruned) containing:

- The **harness runtime** = the 93-package closure + the `jsonrpc-demo` bin as
  the entry point.
- The **TUI** = `apps/tui` (the OpenTUI client), spawning the harness as a
  subprocess.
- No web server, no web UI, no website, no Python, no native, no runnable
  examples, no docs site.
- A trimmed build/test/lint gate set scoped to the reduced package set.

**Phases:**

- **Phase 0 — Baseline & safety:** confirm both repos build/run as-is; branch/tag.
- **Phase 1 — Prune the harness:** delete the 147 non-closure packages; update
  `pnpm-workspace.yaml`; verify install/build/typecheck/test.
- **Phase 2 — Land the TUI:** copy the TUI into `apps/tui`; convert `link:` →
  `workspace:`; add to the workspace; verify install/typecheck/build.
- **Phase 3 — Wire TUI → harness:** point the TUI at the in-repo harness bin;
  verify it boots and can run a turn.
- **Phase 4 — Trim the gates:** reduce `scripts/`, vitest/tsconfig/lint configs
  to the reduced scope; verify all gates pass.
- **Phase 5 — Remove non-package cruft:** `website/`, `python/`, `native/`,
  runnable `examples/`, trim `docs/`; verify.
- **Phase 6 — Final verification:** clean install → build → typecheck → lint →
  test → run the TUI end-to-end.

---

## 3. TODO list (verification at each stage)

> Work happens in `~/git/deepseek-harness` (the base). The TUI is copied in from
> `~/git/deepseek-tui`. Every stage ends with a **VERIFY** gate; do not proceed
> until it passes.

### Phase 0 — Baseline & safety

- [ ] 0.1 In `deepseek-harness`: `pnpm install && pnpm run build && pnpm run typecheck`.
  - **VERIFY:** build + typecheck exit 0 on a clean tree.
- [ ] 0.2 In `deepseek-tui`: `pnpm install && pnpm run typecheck && pnpm run build`.
  - **VERIFY:** TUI typechecks and bundles to `dist/index.js`.
- [ ] 0.3 Smoke-run the TUI against the harness (needs a provider key):
      `./bin/deepseek-tui`, send one prompt, confirm a streamed reply.
  - **VERIFY:** a full turn completes; `/status` shows a session id.
- [ ] 0.4 Create working branches/tags in both repos (e.g. `merge/tui`, tag
      `pre-merge`).
  - **VERIFY:** `git tag` / `git branch` show the checkpoints.

### Phase 1 — Prune the harness to the 93-package dev closure

- [ ] 1.1 Generate the keep-list (93 names) and the rip-list (147 dirs) from the
      closure script; save both to files for review.
  - **VERIFY:** keep-list ∪ rip-list = all 240 indexed packages; no overlap.
- [ ] 1.2 Delete the 147 rip package directories (web stack, acp, e2b, lsp, mcp,
      terminal, web, workflow, spill, hooks, todo, plan, schedule, workspace,
      feedback, guard, extensions, bundle/{base,headless,web-app}, extra
      subagent/session/shell/typert/test-support variants, `apps/cli`, `apps/web`).
  - **VERIFY:** `git status` shows only intended deletions; the 93 keep dirs remain.
- [ ] 1.3 Update `pnpm-workspace.yaml` (drop workspace globs that no longer
      match; keep `packages/*/*`, `vendor/*`, `apps/*`).
  - **VERIFY:** `pnpm install` succeeds with no missing-workspace errors.
- [ ] 1.4 `pnpm install && pnpm run build && pnpm run typecheck`.
  - **VERIFY:** build + typecheck exit 0 with the reduced package set.
- [ ] 1.5 `pnpm run test` (unit) scoped to remaining packages.
  - **VERIFY:** tests pass; no test imports a deleted package.

### Phase 2 — Land the TUI as `apps/tui`

- [ ] 2.1 Copy `deepseek-tui/{src,bin,cordis.yml,package.json,tsconfig.json,
eslint.config.mjs,.env.example,README.md}` into `deepseek-harness/apps/tui/`.
  - **VERIFY:** files present; no `node_modules`/`dist` copied in.
- [ ] 2.2 In `apps/tui/package.json`: convert all 29 `link:../deepseek-harness/…`
      deps to `workspace:^`; keep `@opentui/*` + `react` as-is; set `name` to
      `@deepseek-ai/dsh-tui`.
  - **VERIFY:** no `link:` specifiers remain; all `workspace:^` names exist in the
    keep-set.
- [ ] 2.3 Add `apps/*` coverage (already globbed) — confirm `apps/tui` is picked
      up as a workspace member.
  - **VERIFY:** `pnpm install` links `apps/tui`'s deps into its `node_modules`.
- [ ] 2.4 `pnpm --filter @deepseek-ai/dsh-tui run typecheck && … run build`.
  - **VERIFY:** TUI typechecks and bundles inside the monorepo.

### Phase 3 — Wire TUI → in-repo harness

- [ ] 3.1 Confirm the TUI's harness-bin path
      (`node_modules/@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/bin.js`) resolves to the
      in-repo package after the workspace link.
  - **VERIFY:** the path exists under `apps/tui/node_modules/…`.
- [ ] 3.2 Confirm `apps/tui/cordis.yml` bare plugins resolve from the TUI's
      `node_modules` (all ~20 plugin names are in the keep-set).
  - **VERIFY:** each `name:` in `cordis.yml` maps to a kept, linked package.
- [ ] 3.3 Smoke-run: `pnpm --filter @deepseek-ai/dsh-tui start` (or
      `apps/tui/bin/deepseek-tui`), send one prompt.
  - **VERIFY:** harness subprocess boots, a turn streams back, `/status` works.

### Phase 4 — Trim the gates to the reduced scope

- [ ] 4.1 Audit `scripts/` (149 files): keep build/test/lint/typecheck/core
      verify gates; drop web/docs/translation/i18n/cordis-catalog gates that
      reference deleted packages.
  - **VERIFY:** every remaining `package.json` script resolves to an existing
    script file and existing package.
- [ ] 4.2 Trim root `package.json` scripts (remove `build:web`, `test:web*`,
      `docs:*`, `website:*`, translation/verify-doc-\* entries).
  - **VERIFY:** `pnpm run build && pnpm run typecheck && pnpm run lint` all pass.
- [ ] 4.3 Trim `vitest.config.ts` + `tsconfig.*.json` project references to the
      remaining packages.
  - **VERIFY:** `pnpm run test` and `pnpm run typecheck` pass with no dangling
    project refs.
- [ ] 4.4 Trim `.oxlintrc.json` / eslint config + `knip.json` to the reduced set.
  - **VERIFY:** `pnpm run lint` and `pnpm run knip` pass.

### Phase 5 — Remove non-package cruft

- [ ] 5.1 Delete `website/`, `python/`, `native/`, and the runnable `examples/`
      leaves (keep `packages/examples/{agent-spine-demo,jsonrpc-demo}`).
  - **VERIFY:** `git status` shows only intended deletions; `pnpm install` still
    succeeds (no workspace member references the deleted dirs).
- [ ] 5.2 Trim `docs/` to core architecture/development/testing pages; drop
      web-specific + generated catalogs that reference deleted packages.
  - **VERIFY:** no doc link points at a deleted package (spot-check).
- [ ] 5.3 Update root `AGENTS.md` / `README.md` to describe the single-app
      (harness + TUI) layout and commands.
  - **VERIFY:** README "Run" section matches the actual commands.

### Phase 6 — Final verification

- [ ] 6.1 Clean install from scratch: `rm -rf node_modules */node_modules
apps/*/node_modules && pnpm install`.
  - **VERIFY:** install exits 0; no missing/peer warnings for kept packages.
- [ ] 6.2 `pnpm run build && pnpm run typecheck && pnpm run lint && pnpm run test`.
  - **VERIFY:** all four gates exit 0.
- [ ] 6.3 End-to-end TUI run: launch, `/provider` + auth, send a multi-turn
      conversation with a tool call (e.g. `/shell ls`), `/compact`, `/sessions`
      resume, `/quit`.
  - **VERIFY:** every command behaves per the TUI README; shutdown is clean
    (harness subprocess exits).
- [ ] 6.4 Confirm no web surface remains: grep for `webserver`, `frontend-static`,
      `dsh-web-app`, `vite` in kept `package.json` files.
  - **VERIFY:** zero hits outside comments.
- [ ] 6.5 Tag the result (e.g. `merge/tui-complete`) and write a short
      post-merge note (what was kept, what was dropped, how to run).
  - **VERIFY:** tag exists; note committed.

---

## Appendix A — Closure script (used to derive the keep/rip lists)

See `/tmp/closure.mjs` and `/tmp/ripout.mjs` (run from `~/git/deepseek-harness`).
They index every `package.json` under `packages|vendor|apps|native|python|examples`,
then expand the TUI's 29 deps over `dependencies`+`peerDependencies` (runtime) and
`+devDependencies` (dev). Re-run after any dependency edit to regenerate the lists.

## Appendix B — Risks / watch-items

- **`agent-spine-demo` devDeps** pull in sandbox + landlock packages; if you drop
  to the 82 runtime set, either skip those package tests or keep the 11 dev-only
  packages (recommended).
- **Bun vs pnpm:** the TUI builds with Bun inside a pnpm workspace. If Bun's
  resolver chokes on pnpm's layout, normalize the TUI to `node`/`tsdown` (small
  change to `apps/tui/package.json` scripts).
- **`cordis.yml` `!!js` tags** reference `process.env.*`; keep the env contract
  (`DSH_CWD`, `DSH_SESSION_ROOT`, `DSH_CORDIS_CONFIG`, `DSH_PI_AI_AUTH_PATH`)
  intact when moving the TUI.
- **`typert-protocol` is kept** but the rest of `packages/typert` is dropped —
  confirm no kept package imports `typert-generator/loader/registry` at runtime
  (they are dev-only).
