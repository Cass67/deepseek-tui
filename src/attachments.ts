/** Local image admission and model prompt construction. */

import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ContentBlock,
  ImageAttachmentLimits,
  ImageAttachmentRef,
  ImageMediaType,
} from "@deepseek-ai/dsh-sdk-client";

const MEDIA_TYPES_BY_EXTENSION: Readonly<Record<string, ImageMediaType>> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface PreparedImageFile {
  data: Uint8Array;
  mediaType: ImageMediaType;
  name: string;
}

/** Recognize one absolute raster-image path pasted by terminal file drag/drop. */
export function pastedImagePath(text: string): string | undefined {
  let candidate = text.trim();
  if (!candidate || candidate.includes("\n") || candidate.includes("\0"))
    return undefined;
  if (
    (candidate.startsWith("'") && candidate.endsWith("'")) ||
    (candidate.startsWith('"') && candidate.endsWith('"'))
  ) {
    candidate = candidate.slice(1, -1);
  }
  if (process.platform !== "win32")
    candidate = candidate.replace(/\\(.)/g, "$1");
  if (candidate.startsWith("file://")) {
    try {
      candidate = fileURLToPath(candidate);
    } catch {
      return undefined;
    }
  }
  if (!isAbsolute(candidate)) return undefined;
  return MEDIA_TYPES_BY_EXTENSION[extname(candidate).toLowerCase()]
    ? candidate
    : undefined;
}

/** Resolve one lexical child of the canonical workspace root. */
export function containedWorkspacePath(
  workspaceRoot: string,
  inputPath: string,
): string {
  const candidate = resolve(workspaceRoot, inputPath);
  const child = relative(workspaceRoot, candidate);
  if (
    child === ".." ||
    child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(child)
  ) {
    throw new Error("Attachment path must stay within the workspace");
  }
  return candidate;
}

async function readBoundedFile(
  path: string,
  maxBytes: number,
): Promise<Uint8Array> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP") {
      throw new Error("Attachment path must not contain symbolic links", {
        cause: error,
      });
    }
    throw error;
  }
  try {
    const canonicalPath = await realpath(path);
    if (canonicalPath !== path)
      throw new Error("Attachment path must not contain symbolic links");

    const metadata = await handle.stat();
    if (!metadata.isFile())
      throw new Error("Attachment path is not a regular file");
    if (metadata.size > maxBytes) {
      throw new Error(
        `Image is ${metadata.size} bytes; limit is ${maxBytes} bytes`,
      );
    }

    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        buffer.byteLength - offset,
        null,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maxBytes)
      throw new Error(
        `Image grew beyond the ${maxBytes}-byte limit while reading`,
      );
    return new Uint8Array(buffer.subarray(0, offset));
  } finally {
    await handle.close();
  }
}

/** Validate and read one bounded raster image from the workspace. */
export async function prepareImageFile(
  inputPath: string,
  cwd: string,
  limits: ImageAttachmentLimits,
  allowOutsideWorkspace = false,
): Promise<PreparedImageFile> {
  const mediaType = MEDIA_TYPES_BY_EXTENSION[extname(inputPath).toLowerCase()];
  if (!mediaType || !limits.mediaTypes.includes(mediaType)) {
    throw new Error(
      `Unsupported image type: ${extname(inputPath) || "(none)"}`,
    );
  }

  const workspaceRoot = await realpath(cwd);
  const absolutePath = allowOutsideWorkspace
    ? resolve(inputPath)
    : containedWorkspacePath(workspaceRoot, inputPath);
  const data = await readBoundedFile(absolutePath, limits.maxImageBytes);
  return { data, mediaType, name: basename(absolutePath) };
}

/** Build one user prompt without exposing local attachment paths. */
export function promptContent(
  text: string,
  attachments: readonly ImageAttachmentRef[],
): ContentBlock[] {
  return [
    ...(text ? [{ type: "text" as const, text }] : []),
    ...attachments.map((attachment) => ({
      type: "image" as const,
      attachment,
    })),
  ];
}
