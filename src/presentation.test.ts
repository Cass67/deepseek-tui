import assert from "node:assert/strict";
import { test } from "node:test";
import { THEMES, createSyntaxStyle } from "./theme.tsx";
import { toolSummary } from "./ToolCard.tsx";

test("summarizes completed tools without rendering their full output", () => {
  assert.equal(
    toolSummary("read", '{"file_path":"/workspace/profile.go"}'),
    "/workspace/profile.go",
  );
  assert.equal(
    toolSummary(
      "bash",
      '{"command":"go test ./...","description":"Run Go tests"}',
    ),
    "Run Go tests",
  );
});

test("offers many unique readable semantic themes", () => {
  assert.ok(THEMES.length >= 20);
  assert.equal(new Set(THEMES.map((theme) => theme.id)).size, THEMES.length);
  for (const theme of THEMES) {
    assert.match(theme.id, /^[a-z0-9-]+$/);
    for (const color of Object.values(theme.palette))
      assert.match(color, /^#[0-9a-f]{6}$/i);
    assert.ok(
      contrast(theme.palette.background, theme.palette.text) >= 4.5,
      `${theme.id} text contrast`,
    );
    assert.ok(
      contrast(theme.palette.background, theme.palette.textMuted) >= 4.5,
      `${theme.id} muted contrast`,
    );
  }
});

test("registers distinct Tree-sitter colors for fenced code", () => {
  const theme = THEMES[0];
  assert.ok(theme);
  const style = createSyntaxStyle(theme.palette);
  try {
    assert.notDeepEqual(
      style.getStyle("keyword")?.fg,
      style.getStyle("default")?.fg,
    );
    assert.notDeepEqual(
      style.getStyle("string")?.fg,
      style.getStyle("keyword")?.fg,
    );
    assert.ok(style.getStyle("comment")?.italic);
  } finally {
    style.destroy();
  }
});

function contrast(left: string, right: string): number {
  const luminance = (hex: string): number => {
    const channels = [1, 3, 5]
      .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      );
    return (
      0.2126 * (channels[0] ?? 0) +
      0.7152 * (channels[1] ?? 0) +
      0.0722 * (channels[2] ?? 0)
    );
  };
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
