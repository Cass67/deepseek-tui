import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type {
  ImageAttachmentLimits,
  ImageAttachmentRef,
} from "@deepseek-ai/dsh-sdk-client";
import {
  containedWorkspacePath,
  pastedImagePath,
  prepareImageFile,
  promptContent,
} from "./attachments.ts";

const limits: ImageAttachmentLimits = {
  maxImageBytes: 4,
  maxImagesPerMessage: 2,
  maxMessageImageBytes: 8,
  maxImagePixels: 100,
  mediaTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
};

test("validates attachment path, extension, limit, and constructs durable prompt blocks", async () => {
  const root = await mkdtemp(join(tmpdir(), "deepseek-tui-attachment-"));
  await writeFile(join(root, "ok.PNG"), new Uint8Array([1, 2, 3]));
  await writeFile(join(root, "large.jpg"), new Uint8Array([1, 2, 3, 4, 5]));
  await writeFile(join(root, "note.txt"), "x");
  await mkdir(join(root, "folder.png"));
  await symlink(join(root, "ok.PNG"), join(root, "link.png"));

  assert.deepEqual(await prepareImageFile("ok.PNG", root, limits), {
    data: new Uint8Array([1, 2, 3]),
    mediaType: "image/png",
    name: "ok.PNG",
  });
  await assert.rejects(
    prepareImageFile("large.jpg", root, limits),
    /limit is 4 bytes/,
  );
  await assert.rejects(
    prepareImageFile("note.txt", root, limits),
    /Unsupported image type/,
  );
  await assert.rejects(
    prepareImageFile("folder.png", root, limits),
    /not a regular file/,
  );
  await assert.rejects(
    prepareImageFile("link.png", root, limits),
    /must not contain symbolic links/,
  );
  await assert.rejects(
    prepareImageFile("../escape.png", root, limits),
    /must stay within the workspace/,
  );
  assert.equal(containedWorkspacePath(root, "ok.PNG"), join(root, "ok.PNG"));

  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const canonicalImage = join(await realpath(root), "ok.PNG");
  assert.equal(
    (await prepareImageFile(canonicalImage, workspace, limits, true)).name,
    "ok.PNG",
  );
  assert.equal(
    pastedImagePath("file:///tmp/dragged%20image.webp"),
    "/tmp/dragged image.webp",
  );
  assert.equal(pastedImagePath("/tmp/not-an-image.txt"), undefined);
  assert.equal(pastedImagePath("describe image.png"), undefined);

  const attachment = {
    attachmentId: "sha256:abc",
    mediaType: "image/png",
    bytes: 3,
    width: 1,
    height: 1,
    name: "ok.PNG",
  } as ImageAttachmentRef;
  assert.deepEqual(promptContent("inspect", [attachment]), [
    { type: "text", text: "inspect" },
    { type: "image", attachment },
  ]);
  assert.deepEqual(promptContent("", [attachment]), [
    { type: "image", attachment },
  ]);
});
