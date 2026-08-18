/** Durable user preferences stored outside caller workspaces. */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { THEMES, type ThemeName } from "./theme.tsx";

const DEFAULT_THEME = THEMES[0].id;
const PREFERENCES_FILE = "preferences.json";

function preferencesPath(configHome?: string): string {
  const root =
    configHome ?? process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(root, "deepseek-tui", PREFERENCES_FILE);
}

function isThemeName(value: unknown): value is ThemeName {
  return (
    typeof value === "string" && THEMES.some((theme) => theme.id === value)
  );
}

/** Load a validated theme, falling back safely for missing or malformed preferences. */
export function loadThemePreference(configHome?: string): ThemeName {
  try {
    const value: unknown = JSON.parse(
      readFileSync(preferencesPath(configHome), "utf8"),
    );
    const theme =
      typeof value === "object" && value !== null
        ? Reflect.get(value, "theme")
        : undefined;
    if (isThemeName(theme)) return theme;
  } catch {
    // Missing or malformed optional preferences use defaults.
  }
  return DEFAULT_THEME;
}

/** Atomically persist selected theme with user-only file permissions. */
export function saveThemePreference(
  theme: ThemeName,
  configHome?: string,
): void {
  const path = preferencesPath(configHome);
  const temporary = `${path}.${process.pid}.tmp`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(temporary, `${JSON.stringify({ theme }, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
}
