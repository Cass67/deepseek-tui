/** In-memory FIFO for follow-up prompts submitted during an active model turn. */

import type { ImageAttachmentRef } from "@deepseek-ai/dsh-sdk-client";

export interface QueuedPrompt {
  text: string;
  attachments: ImageAttachmentRef[];
}

/** Own prompt order, immutable attachment snapshots, and single-drainer admission. */
export class PromptQueue {
  readonly #items: QueuedPrompt[] = [];
  #draining = false;

  get length(): number {
    return this.#items.length;
  }

  enqueue(text: string, attachments: readonly ImageAttachmentRef[]): number {
    this.#items.push({ text, attachments: [...attachments] });
    return this.#items.length;
  }

  begin(): QueuedPrompt | null {
    if (this.#draining) return null;
    const prompt = this.#items.shift();
    if (!prompt) return null;
    this.#draining = true;
    return prompt;
  }

  finish(): void {
    this.#draining = false;
  }

  clear(): void {
    this.#items.length = 0;
    this.#draining = false;
  }
}
