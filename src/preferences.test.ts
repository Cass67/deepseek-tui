import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadThemePreference, saveThemePreference } from "./preferences.ts";

test("theme preference survives restart and rejects malformed values", () => {
  const configHome = mkdtempSync(join(tmpdir(), "deepseek-tui-preferences-"));
  const path = join(configHome, "deepseek-tui", "preferences.json");
  try {
    assert.equal(loadThemePreference(configHome), "tokyo-night");

    saveThemePreference("synthwave", configHome);
    assert.equal(loadThemePreference(configHome), "synthwave");
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
      theme: "synthwave",
    });
    assert.equal(statSync(path).mode & 0o777, 0o600);

    writeFileSync(path, "{broken", "utf8");
    assert.equal(loadThemePreference(configHome), "tokyo-night");

    writeFileSync(path, JSON.stringify({ theme: "not-a-theme" }), "utf8");
    assert.equal(loadThemePreference(configHome), "tokyo-night");
  } finally {
    rmSync(configHome, { recursive: true, force: true });
  }
});
