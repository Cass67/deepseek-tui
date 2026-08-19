---
name: mount-harness-plugin
description: Add a DeepSeek Harness plugin to this TUI - link the dependency, add the cordis.yml row, install, and verify it boots.
whenToUse: The user wants a harness capability that is not currently available, or asks to mount, enable, or wire up a dsh-* package.
---

# Mounting a harness plugin

The TUI composes the harness from two layers: `cordis.yml` in this repo, and the
plugins `@deepseek-ai/dsh-agent-spine-demo` mounts underneath it. A capability is
only reachable if one of those two mounts it, so always check both before
concluding something is missing:

```bash
grep -oE '"@deepseek-ai/dsh-[a-z0-9-]+"' node_modules/@deepseek-ai/dsh-agent-spine-demo/lib/*.js | sort -u
```

## Steps

1. **Find the package** in `~/git/deepseek-harness/packages/<family>/<name>`.
   Read its `src/index.ts` for two things: the `inject` list (the services it
   requires must already be mounted) and its `Config` schema (a field marked
   `.required()` has no default and must be supplied).

2. **Link the dependency** in `package.json`, matching the existing style:

   ```json
   "@deepseek-ai/dsh-tool-session-query": "link:../deepseek-harness/packages/session-query/tool-session-query"
   ```

3. **Add the `cordis.yml` row.** Order matters: a plugin must appear after
   whatever provides the services it injects.

   ```yaml
   - id: tool-session-query
     name: "@deepseek-ai/dsh-tool-session-query"
   ```

4. **Install and verify** — `pnpm install`, then:

   ```bash
   node scripts/boot-test.mjs      # composition loads
   node scripts/l2-probe.mjs       # L2 methods respond
   ```

   A missing inject fails at boot with the unsatisfied service name. A bad
   config fails with the offending field.

## Gotchas

- A provider and its tools are separate packages. Mounting
  `dsh-session-query-sqlite` gives you the index; the model cannot query it
  until `dsh-tool-session-query` is mounted too.
- Check the plugin's config for switches that disable it. The session index
  shipped with `openAt: never`, which refuses every search regardless of
  which tools are mounted.
- New session event types need a decision in `src/useHarness.ts`: render them
  in `trajectorySummary` or add them to `UNSURFACED_EVENT_TYPES`. The parity
  test in `src/events.test.ts` fails until you do.
