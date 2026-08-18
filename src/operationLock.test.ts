import assert from "node:assert/strict";
import { test } from "node:test";
import { OperationLock } from "./operationLock.ts";

test("admits one transition synchronously and reports idle once per owner", () => {
  let idleCount = 0;
  const lock = new OperationLock(() => {
    idleCount += 1;
  });
  const release = lock.acquire("resume a session");
  assert.equal(lock.isActive, true);
  assert.throws(
    () => lock.acquire("send a prompt"),
    /resume a session is still in progress/,
  );
  release();
  release();
  assert.equal(lock.isActive, false);
  assert.equal(idleCount, 1);
  const nextRelease = lock.acquire("send a prompt");
  nextRelease();
  assert.equal(idleCount, 2);
});
