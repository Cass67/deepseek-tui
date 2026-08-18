import assert from "node:assert/strict";
import test from "node:test";
import { openExternalUrl } from "./openExternal.ts";

test("authentication links reject non-HTTP protocols before native launch", () => {
  assert.throws(
    () => openExternalUrl("file:///tmp/secret"),
    /Refusing non-HTTP authentication link/,
  );
  assert.throws(
    () => openExternalUrl("javascript:alert(1)"),
    /Refusing non-HTTP authentication link/,
  );
});
