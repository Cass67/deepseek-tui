/** Synchronous admission lock for session-state transitions. */

/** Reject overlapping operations before either can cross an async boundary. */
export class OperationLock {
  private active?: string;

  constructor(private readonly onIdle?: () => void) {}

  /** Whether one transition currently owns admission. */
  get isActive(): boolean {
    return this.active !== undefined;
  }

  /** Claim exclusive transition ownership. */
  acquire(operation: string): () => void {
    if (this.active)
      throw new Error(
        `Cannot ${operation}; ${this.active} is still in progress`,
      );
    this.active = operation;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = undefined;
      this.onIdle?.();
    };
  }
}
