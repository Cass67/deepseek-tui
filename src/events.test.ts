import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ChatMessage,
  GoalInfo,
  JobInfo,
  SubagentInfo,
  WorkflowRun,
} from "./types.ts";
import { activityForEvent, processEvent } from "./useHarness.ts";

/** Build a fresh processEvent ctx with the mutable panel collections. */
function makeCtx() {
  const messages: ChatMessage[] = [];
  const usage = { input: 0, output: 0 };
  const subagents: SubagentInfo[] = [];
  const jobs: JobInfo[] = [];
  const toolCallNames = new Map<string, string>();
  const workflowRuns: WorkflowRun[] = [];
  const ctx = {
    streamingText: "",
    assistantId: null as string | null,
    usage,
    planModeActive: false,
    subagents,
    jobs,
    goal: null as GoalInfo | null,
    workflowRuns,
    toolCallNames,
  };
  const apply = (event: Record<string, unknown>): void => {
    const result = processEvent(event, messages, ctx);
    ctx.streamingText = result.streamingText;
    ctx.assistantId = result.assistantId;
    ctx.planModeActive = result.planModeActive;
  };
  return {
    messages,
    usage,
    subagents,
    jobs,
    toolCallNames,
    apply,
    streamRef: () => ({
      streamingText: ctx.streamingText,
      assistantId: ctx.assistantId,
      planModeActive: ctx.planModeActive,
    }),
    goalRef: () => ctx.goal,
  };
}

test("projects direct user data, tool correlation, and cancelled partial output", () => {
  const { messages, apply, streamRef } = makeCtx();

  apply({
    type: "user/message",
    data: { source: { kind: "user" }, content: [{ type: "text", text: "hi" }] },
  });
  apply({
    type: "tool/call",
    data: { callId: "call-1", name: "read", arguments: "{}", turn: 1, step: 1 },
  });
  apply({
    type: "tool/result",
    data: {
      message: {
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            content: [{ type: "text", text: "done" }],
            isError: false,
          },
        ],
        source: { kind: "tool", callId: "call-1" },
      },
    },
  });
  apply({
    type: "assistant/chunk",
    data: { chunk: { type: "text-delta", text: "partial" }, turn: 1, step: 2 },
  });
  apply({
    type: "turn/end",
    data: { reason: { kind: "aborted", reason: { kind: "user" } } },
  });

  assert.equal(messages[0]?.content, "hi");
  assert.equal(messages[1]?.toolCallId, "call-1");
  assert.equal(messages[2]?.toolCallId, "call-1");
  assert.equal(messages[2]?.content, "done");
  assert.equal(messages[2]?.toolError, false);
  assert.equal(messages[3]?.content, "partial");
  assert.equal(messages[4]?.content, "Turn cancelled");
  assert.deepEqual(streamRef(), {
    streamingText: "",
    assistantId: null,
    planModeActive: false,
  });
});

test("keeps reasoning out of answer markdown and exposes long-running activity", () => {
  const messages: ChatMessage[] = [];
  const usage = { input: 0, output: 0 };
  const reasoning = {
    type: "assistant/chunk",
    data: { chunk: { type: "reasoning-delta", text: "private thought" } },
  };
  const stream = processEvent(reasoning, messages, {
    streamingText: "",
    assistantId: null,
    usage,
    planModeActive: false,
    subagents: [],
    jobs: [],
    goal: null,
    workflowRuns: [],
    toolCallNames: new Map<string, string>(),
  });

  assert.deepEqual(messages, []);
  assert.deepEqual(stream, {
    streamingText: "",
    assistantId: null,
    planModeActive: false,
  });
  assert.equal(activityForEvent(reasoning, "waiting for model"), "thinking");
  assert.equal(
    activityForEvent({ type: "compaction/start", data: {} }, "thinking"),
    "compacting context",
  );
  assert.equal(
    activityForEvent(
      { type: "compaction/end", data: {} },
      "compacting context",
    ),
    "resuming after compaction",
  );
  assert.equal(
    activityForEvent({ type: "tool/call", data: { name: "read" } }, "thinking"),
    "running read",
  );
});

test("updates the todo list in place and tracks plan mode flips", () => {
  const { messages, apply, streamRef } = makeCtx();

  apply({
    type: "plan/mode",
    data: { active: true },
  });
  assert.equal(streamRef().planModeActive, true);

  apply({
    type: "todo/write",
    data: {
      todos: [
        { content: "step one", status: "in_progress" },
        { content: "step two", status: "pending" },
      ],
    },
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.role, "todo");
  assert.deepEqual(messages[0]?.todos, [
    { content: "step one", status: "in_progress" },
    { content: "step two", status: "pending" },
  ]);

  // A second write updates the same message instead of stacking a new one.
  apply({
    type: "todo/write",
    data: {
      todos: [
        { content: "step one", status: "completed" },
        { content: "step two", status: "in_progress" },
      ],
    },
  });
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0]?.todos, [
    { content: "step one", status: "completed" },
    { content: "step two", status: "in_progress" },
  ]);

  apply({
    type: "plan/mode",
    data: { active: false },
  });
  assert.equal(streamRef().planModeActive, false);
});

test("tracks subagent delegations and job_list results for the panels", () => {
  const { subagents, jobs, apply } = makeCtx();

  // A subagent tool call registers a running child.
  apply({
    type: "tool/call",
    data: {
      callId: "sub-1",
      name: "subagent",
      arguments: JSON.stringify({ description: "research topic", prompt: "go" }),
      turn: 1,
      step: 1,
    },
  });
  assert.equal(subagents.length, 1);
  assert.equal(subagents[0]?.description, "research topic");
  assert.equal(subagents[0]?.status, "running");

  // The matching result marks the child done.
  apply({
    type: "tool/result",
    data: {
      message: {
        content: [
          {
            type: "tool-result",
            toolCallId: "sub-1",
            content: [{ type: "text", text: "started subagent abc" }],
            isError: false,
          },
        ],
        source: { kind: "tool", callId: "sub-1" },
      },
    },
  });
  assert.equal(subagents[0]?.status, "done");

  // A job_list result refreshes the jobs panel.
  apply({
    type: "tool/call",
    data: {
      callId: "jobs-1",
      name: "job_list",
      arguments: "{}",
      turn: 1,
      step: 2,
    },
  });
  apply({
    type: "tool/result",
    data: {
      message: {
        content: [
          {
            type: "tool-result",
            toolCallId: "jobs-1",
            content: [
              {
                type: "text",
                text: "bash-1 [bash] completed — sleep 2\ntask-2 [task] running — long job",
              },
            ],
            isError: false,
          },
        ],
        source: { kind: "tool", callId: "jobs-1" },
      },
    },
  });
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs[0], {
    id: "bash-1",
    kind: "bash",
    status: "completed",
    label: "sleep 2",
  });
  assert.deepEqual(jobs[1], {
    id: "task-2",
    kind: "task",
    status: "running",
    label: "long job",
  });
});

test("tracks goal changes and clears the goal on clear", () => {
  const { apply, goalRef } = makeCtx();

  // A goal create sets the active goal.
  apply({
    type: "goal/change",
    data: {
      operation: "create",
      goal: {
        id: "goal-1",
        revision: 1,
        objective: "Ship the feature",
        phase: "active",
        maxGoalRounds: 5,
      },
      roundsStarted: 0,
    },
  });
  assert.equal(goalRef()?.id, "goal-1");
  assert.equal(goalRef()?.objective, "Ship the feature");
  assert.equal(goalRef()?.phase, "active");
  assert.equal(goalRef()?.maxGoalRounds, 5);

  // A goal edit updates the phase and rounds.
  apply({
    type: "goal/change",
    data: {
      operation: "edit",
      goal: {
        id: "goal-1",
        revision: 2,
        objective: "Ship the feature",
        phase: "paused",
        maxGoalRounds: 5,
      },
      roundsStarted: 2,
    },
  });
  assert.equal(goalRef()?.phase, "paused");
  assert.equal(goalRef()?.roundsStarted, 2);

  // A clear removes the goal.
  apply({
    type: "goal/change",
    data: {
      operation: "clear",
      cleared: { id: "goal-1", revision: 2 },
    },
  });
  assert.equal(goalRef(), null);
});

test("tracks workflow runs and member outcomes", () => {
  const { apply } = makeCtx();
  const workflowRuns: WorkflowRun[] = [];

  // A run-start creates the run.
  apply({
    type: "tool-workflow/run-start",
    data: { runId: "run-1", name: "build pipeline" },
  });
  assert.equal(workflowRuns.length, 0); // makeCtx has its own array

  // Re-run with a shared array to verify mutation.
  const shared: WorkflowRun[] = [];
  const ctx = {
    streamingText: "",
    assistantId: null as string | null,
    usage: { input: 0, output: 0 },
    planModeActive: false,
    subagents: [],
    jobs: [],
    goal: null,
    workflowRuns: shared,
    toolCallNames: new Map<string, string>(),
  };
  const messages: ChatMessage[] = [];

  processEvent(
    { type: "tool-workflow/run-start", data: { runId: "run-1", name: "build pipeline" } },
    messages,
    ctx,
  );
  assert.equal(shared.length, 1);
  assert.equal(shared[0].name, "build pipeline");
  assert.equal(shared[0].ended, false);

  processEvent(
    {
      type: "tool-workflow/agent-start",
      data: { runId: "run-1", seq: 1, label: "compile", phase: "build" },
    },
    messages,
    ctx,
  );
  assert.equal(shared[0].members.length, 1);
  assert.equal(shared[0].members[0].label, "compile");

  processEvent(
    {
      type: "tool-workflow/agent-end",
      data: { runId: "run-1", seq: 1, outcome: "completed" },
    },
    messages,
    ctx,
  );
  assert.equal(shared[0].members[0].outcome, "completed");

  processEvent(
    { type: "tool-workflow/run-end", data: { runId: "run-1" } },
    messages,
    ctx,
  );
  assert.equal(shared[0].ended, true);
});
