import assert from "node:assert/strict";
import { test } from "node:test";
import type { ClipboardService } from "@opentui/core";
import { AttachmentId } from "@deepseek-ai/dsh-attachment";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { ThemeProvider } from "./theme.tsx";
import { InputBar } from "./InputBar.tsx";

function fakeClipboard(readText: string, writes: string[]): ClipboardService {
  return {
    read: async () => ({
      status: "read",
      representation: {
        mimeType: "text/plain",
        bytes: new TextEncoder().encode(readText),
      },
    }),
    writeText: async (text) => {
      writes.push(text);
      return {
        host: { status: "written" },
        terminal: { status: "not-attempted", capability: "unknown" },
      };
    },
    clear: async () => ({
      host: { status: "cleared" },
      terminal: { status: "not-attempted", capability: "unknown" },
    }),
    dispose: async () => {},
  };
}

test("composer copies selection and pastes at cursor", async () => {
  const writes: string[] = [];
  const submissions: string[] = [];
  const setup = await testRender(
    <ThemeProvider name="tokyo-night">
      <InputBar
        onSubmit={(text) => submissions.push(text)}
        clipboard={fakeClipboard(" pasted", writes)}
        onClipboardNotice={() => {}}
        runtimeCommands={[
          {
            name: "doctor",
            description: "Inspect runtime",
            input: { hint: "[scope]" },
          },
        ]}
      />
    </ThemeProvider>,
    { width: 100, height: 40, kittyKeyboard: true },
  );

  const interact = async (action: () => void | Promise<void>) => {
    await act(async () => {
      await action();
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await setup.flush();
    });
  };

  try {
    await interact(() => setup.mockInput.typeText("hello"));
    await interact(() =>
      setup.mockInput.pressKey("a", { ctrl: true, shift: true }),
    );
    assert.deepEqual(writes, []);

    await interact(() => setup.mockInput.pressKey("y", { ctrl: true }));
    assert.equal(writes.at(-1), "hello");

    await interact(() => setup.mockInput.pressKey("END"));
    await interact(() => setup.mockInput.pressKey("v", { ctrl: true }));
    await interact(() => setup.mockInput.pressEnter());
    assert.deepEqual(submissions, ["hello pasted"]);

    await interact(async () => {
      await setup.mockInput.typeText("/do");
      setup.mockInput.pressTab();
    });
    await interact(() => setup.mockInput.typeText("scope"));
    await interact(() => setup.mockInput.pressEnter());
    assert.deepEqual(submissions, ["hello pasted", "/doctor scope"]);

    await interact(() => setup.mockInput.pasteBracketedText("bracketed paste"));
    await interact(() => setup.mockInput.pressEnter());
    assert.deepEqual(submissions, [
      "hello pasted",
      "/doctor scope",
      "bracketed paste",
    ]);
  } finally {
    await act(async () => setup.renderer.destroy());
  }
});

test("double-click selects a composer word and copies it to host clipboard", async () => {
  const writes: string[] = [];
  const setup = await testRender(
    <ThemeProvider name="tokyo-night">
      <InputBar
        onSubmit={() => {}}
        clipboard={fakeClipboard("", writes)}
        onClipboardNotice={() => {}}
      />
    </ThemeProvider>,
    { width: 80, height: 24, kittyKeyboard: true },
  );

  try {
    await act(async () => {
      await setup.mockInput.typeText("hello world");
      await setup.flush();
      await setup.mockMouse.doubleClick(9, 2);
      await setup.flush();
      await Promise.resolve();
    });
    assert.equal(writes.at(-1), "world");
  } finally {
    await act(async () => setup.renderer.destroy());
  }
});

test("composer copy falls back to full text when nothing is selected", async () => {
  const writes: string[] = [];
  const setup = await testRender(
    <ThemeProvider name="tokyo-night">
      <InputBar
        onSubmit={() => {}}
        clipboard={fakeClipboard("", writes)}
        onClipboardNotice={() => {}}
      />
    </ThemeProvider>,
    { width: 80, height: 24, kittyKeyboard: true },
  );

  try {
    await act(async () => {
      await setup.mockInput.typeText("hello world");
      await setup.flush();
      await setup.mockInput.pressKey("y", { ctrl: true });
      await setup.flush();
      await Promise.resolve();
    });
    assert.deepEqual(writes, ["hello world"]);
  } finally {
    await act(async () => setup.renderer.destroy());
  }
});

test("terminal image drag attaches path instead of inserting it as prompt text", async () => {
  const paths: string[] = [];
  const submissions: string[] = [];
  const setup = await testRender(
    <ThemeProvider name="tokyo-night">
      <InputBar
        onSubmit={(text) => submissions.push(text)}
        clipboard={fakeClipboard("", [])}
        onClipboardNotice={() => {}}
        onAttachPath={(path) => paths.push(path)}
      />
    </ThemeProvider>,
    { width: 80, height: 24, kittyKeyboard: true },
  );

  try {
    await act(async () => {
      await setup.mockInput.pasteBracketedText("/tmp/dragged\\ image.png ");
      setup.mockInput.pressEnter();
      await setup.flush();
    });
    assert.deepEqual(paths, ["/tmp/dragged image.png"]);
    assert.deepEqual(submissions, []);
  } finally {
    await act(async () => setup.renderer.destroy());
  }
});

test("pending paste cancels when composer changes before clipboard read finishes", async () => {
  let resolveRead:
    | ((value: Awaited<ReturnType<ClipboardService["read"]>>) => void)
    | undefined;
  const clipboard = fakeClipboard("", []);
  clipboard.read = async () =>
    new Promise((resolve) => {
      resolveRead = resolve;
    });
  const notices: string[] = [];
  const setup = await testRender(
    <ThemeProvider name="tokyo-night">
      <InputBar
        onSubmit={() => {}}
        clipboard={clipboard}
        onClipboardNotice={(notice) => notices.push(notice)}
      />
    </ThemeProvider>,
    { width: 80, height: 24, kittyKeyboard: true },
  );

  try {
    await act(async () => {
      await setup.mockInput.typeText("before");
      setup.mockInput.pressKey("v", { super: true });
      await setup.mockInput.typeText(" changed");
      await setup.flush();
      resolveRead?.({
        status: "read",
        representation: {
          mimeType: "text/plain",
          bytes: new TextEncoder().encode(" pasted"),
        },
      });
      await Promise.resolve();
      await setup.flush();
    });
    assert.deepEqual(notices, [
      "Paste cancelled because composer changed while reading clipboard.",
    ]);
  } finally {
    await act(async () => setup.renderer.destroy());
  }
});

test("slash renders every local and runtime command without another keystroke", async () => {
  const setup = await testRender(
    <ThemeProvider name="tokyo-night">
      <InputBar
        onSubmit={() => {}}
        clipboard={fakeClipboard("", [])}
        onClipboardNotice={() => {}}
        runtimeCommands={[{ name: "doctor", description: "Inspect runtime" }]}
      />
    </ThemeProvider>,
    { width: 50, height: 24, kittyKeyboard: true },
  );

  try {
    await act(async () => {
      setup.mockInput.pressKey("/");
      await setup.flush();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await setup.flush();
    const frame = setup.captureCharFrame();
    assert.match(frame, /\/help/);
    assert.match(frame, /\/reasoning/);
    assert.match(frame, /\/quit/);
    assert.match(frame, /\/doctor/);
  } finally {
    await act(async () => setup.renderer.destroy());
  }
});

test("narrow command catalog retains commands with queue and attachment rows", async () => {
  const setup = await testRender(
    <ThemeProvider name="tokyo-night">
      <InputBar
        onSubmit={() => {}}
        clipboard={fakeClipboard("", [])}
        onClipboardNotice={() => {}}
        queuedPromptCount={2}
        attachments={[
          {
            attachmentId: AttachmentId("image:test"),
            mediaType: "image/png",
            bytes: 4,
            width: 1,
            height: 1,
            name: "a-very-long-image-name.png",
          },
        ]}
      />
    </ThemeProvider>,
    { width: 20, height: 24, kittyKeyboard: true },
  );

  try {
    await act(async () => {
      setup.mockInput.pressKey("/");
      await setup.flush();
    });
    await act(async () => Promise.resolve());
    await setup.flush();
    const frame = setup.captureCharFrame();
    assert.match(frame, /2 queued/);
    assert.match(frame, /1 image/);
    assert.match(frame, /\/help/);
    assert.match(frame, /\/quit/);
  } finally {
    await act(async () => setup.renderer.destroy());
  }
});
