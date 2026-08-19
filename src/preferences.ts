/** Durable user preferences stored outside caller workspaces. */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { THEMES, type ThemeName } from "./theme.tsx";

const DEFAULT_THEME = THEMES[0].id;
const DEFAULT_SHOW_REASONING = false;
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

function readPreferences(configHome?: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(
      readFileSync(preferencesPath(configHome), "utf8"),
    );
    if (typeof value === "object" && value !== null)
      return value as Record<string, unknown>;
  } catch {
    // Missing or malformed optional preferences use defaults.
  }
  return {};
}

/** Merge one key into the stored preferences, atomically and user-only. */
function writePreference(
  key: string,
  value: unknown,
  configHome?: string,
): void {
  const merged = { ...readPreferences(configHome), [key]: value };
  const path = preferencesPath(configHome);
  const temporary = `${path}.${process.pid}.tmp`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(temporary, `${JSON.stringify(merged, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
}

/** Load a validated theme, falling back safely for missing or malformed preferences. */
export function loadThemePreference(configHome?: string): ThemeName {
  const theme = readPreferences(configHome).theme;
  return isThemeName(theme) ? theme : DEFAULT_THEME;
}

/** Atomically persist selected theme with user-only file permissions. */
export function saveThemePreference(
  theme: ThemeName,
  configHome?: string,
): void {
  writePreference("theme", theme, configHome);
}

/** Whether assistant reasoning is rendered in the transcript. Off by default. */
export function loadShowReasoningPreference(configHome?: string): boolean {
  const value = readPreferences(configHome).showReasoning;
  return typeof value === "boolean" ? value : DEFAULT_SHOW_REASONING;
}

/** Atomically persist the reasoning-visibility choice. */
export function saveShowReasoningPreference(
  show: boolean,
  configHome?: string,
): void {
  writePreference("showReasoning", show, configHome);
}
