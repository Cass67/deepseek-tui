/** Semantic colors shared by every TUI component. */

import { RGBA, SyntaxStyle } from "@opentui/core";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

export interface ThemePalette {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  secondary: string;
  info: string;
  success: string;
  warning: string;
  error: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  palette: ThemePalette;
}

export const THEMES = [
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    palette: {
      background: "#1a1b26",
      surface: "#24283b",
      border: "#3b4261",
      text: "#c0caf5",
      textMuted: "#8b92b8",
      primary: "#7aa2f7",
      secondary: "#bb9af7",
      info: "#7dcfff",
      success: "#9ece6a",
      warning: "#e0af68",
      error: "#f7768e",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    palette: {
      background: "#282a36",
      surface: "#343746",
      border: "#6272a4",
      text: "#f8f8f2",
      textMuted: "#b8b8c8",
      primary: "#8be9fd",
      secondary: "#bd93f9",
      info: "#8be9fd",
      success: "#50fa7b",
      warning: "#f1fa8c",
      error: "#ff5555",
    },
  },
  {
    id: "nord",
    name: "Nord",
    palette: {
      background: "#2e3440",
      surface: "#3b4252",
      border: "#4c566a",
      text: "#eceff4",
      textMuted: "#aeb8c6",
      primary: "#88c0d0",
      secondary: "#b48ead",
      info: "#81a1c1",
      success: "#a3be8c",
      warning: "#ebcb8b",
      error: "#bf616a",
    },
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    palette: {
      background: "#1e1e2e",
      surface: "#313244",
      border: "#585b70",
      text: "#cdd6f4",
      textMuted: "#a6adc8",
      primary: "#89b4fa",
      secondary: "#cba6f7",
      info: "#89dceb",
      success: "#a6e3a1",
      warning: "#f9e2af",
      error: "#f38ba8",
    },
  },
  {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    palette: {
      background: "#eff1f5",
      surface: "#e6e9ef",
      border: "#9ca0b0",
      text: "#4c4f69",
      textMuted: "#5c5f77",
      primary: "#1e66f5",
      secondary: "#8839ef",
      info: "#04a5e5",
      success: "#40a02b",
      warning: "#df8e1d",
      error: "#d20f39",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    palette: {
      background: "#282828",
      surface: "#3c3836",
      border: "#665c54",
      text: "#ebdbb2",
      textMuted: "#bdae93",
      primary: "#83a598",
      secondary: "#d3869b",
      info: "#8ec07c",
      success: "#b8bb26",
      warning: "#fabd2f",
      error: "#fb4934",
    },
  },
  {
    id: "gruvbox-light",
    name: "Gruvbox Light",
    palette: {
      background: "#fbf1c7",
      surface: "#ebdbb2",
      border: "#bdae93",
      text: "#3c3836",
      textMuted: "#665c54",
      primary: "#076678",
      secondary: "#8f3f71",
      info: "#427b58",
      success: "#79740e",
      warning: "#b57614",
      error: "#9d0006",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    palette: {
      background: "#002b36",
      surface: "#073642",
      border: "#586e75",
      text: "#eee8d5",
      textMuted: "#93a1a1",
      primary: "#268bd2",
      secondary: "#6c71c4",
      info: "#2aa198",
      success: "#859900",
      warning: "#b58900",
      error: "#dc322f",
    },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    palette: {
      background: "#fdf6e3",
      surface: "#eee8d5",
      border: "#93a1a1",
      text: "#073642",
      textMuted: "#586e75",
      primary: "#006ca8",
      secondary: "#5f5faf",
      info: "#147d75",
      success: "#667600",
      warning: "#8f6f00",
      error: "#c62927",
    },
  },
  {
    id: "one-dark",
    name: "One Dark",
    palette: {
      background: "#282c34",
      surface: "#21252b",
      border: "#4b5263",
      text: "#abb2bf",
      textMuted: "#9da5b4",
      primary: "#61afef",
      secondary: "#c678dd",
      info: "#56b6c2",
      success: "#98c379",
      warning: "#e5c07b",
      error: "#e06c75",
    },
  },
  {
    id: "monokai",
    name: "Monokai",
    palette: {
      background: "#272822",
      surface: "#3e3d32",
      border: "#75715e",
      text: "#f8f8f2",
      textMuted: "#b8b8a8",
      primary: "#66d9ef",
      secondary: "#ae81ff",
      info: "#66d9ef",
      success: "#a6e22e",
      warning: "#e6db74",
      error: "#f92672",
    },
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    palette: {
      background: "#191724",
      surface: "#26233a",
      border: "#403d52",
      text: "#e0def4",
      textMuted: "#908caa",
      primary: "#c4a7e7",
      secondary: "#eb6f92",
      info: "#9ccfd8",
      success: "#31748f",
      warning: "#f6c177",
      error: "#eb6f92",
    },
  },
  {
    id: "everforest",
    name: "Everforest",
    palette: {
      background: "#2d353b",
      surface: "#343f44",
      border: "#4f585e",
      text: "#d3c6aa",
      textMuted: "#a7c080",
      primary: "#7fbbb3",
      secondary: "#d699b6",
      info: "#83c092",
      success: "#a7c080",
      warning: "#dbbc7f",
      error: "#e67e80",
    },
  },
  {
    id: "kanagawa",
    name: "Kanagawa",
    palette: {
      background: "#1f1f28",
      surface: "#2a2a37",
      border: "#54546d",
      text: "#dcd7ba",
      textMuted: "#a6a69c",
      primary: "#7e9cd8",
      secondary: "#957fb8",
      info: "#7fb4ca",
      success: "#98bb6c",
      warning: "#e6c384",
      error: "#e46876",
    },
  },
  {
    id: "ayu-dark",
    name: "Ayu Dark",
    palette: {
      background: "#0b0e14",
      surface: "#11151c",
      border: "#27313d",
      text: "#bfbdb6",
      textMuted: "#8a9199",
      primary: "#39bae6",
      secondary: "#d2a6ff",
      info: "#59c2ff",
      success: "#aad94c",
      warning: "#ffb454",
      error: "#f07178",
    },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    palette: {
      background: "#0d1117",
      surface: "#161b22",
      border: "#30363d",
      text: "#e6edf3",
      textMuted: "#9da7b3",
      primary: "#58a6ff",
      secondary: "#bc8cff",
      info: "#79c0ff",
      success: "#3fb950",
      warning: "#d29922",
      error: "#f85149",
    },
  },
  {
    id: "github-light",
    name: "GitHub Light",
    palette: {
      background: "#ffffff",
      surface: "#f6f8fa",
      border: "#d0d7de",
      text: "#1f2328",
      textMuted: "#59636e",
      primary: "#0969da",
      secondary: "#8250df",
      info: "#0550ae",
      success: "#1a7f37",
      warning: "#9a6700",
      error: "#cf222e",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    palette: {
      background: "#0f172a",
      surface: "#162033",
      border: "#334155",
      text: "#e2e8f0",
      textMuted: "#94a3b8",
      primary: "#38bdf8",
      secondary: "#a78bfa",
      info: "#22d3ee",
      success: "#4ade80",
      warning: "#fbbf24",
      error: "#fb7185",
    },
  },
  {
    id: "synthwave",
    name: "Synthwave",
    palette: {
      background: "#2b213a",
      surface: "#34294f",
      border: "#584a73",
      text: "#f8f8f2",
      textMuted: "#b7a8cc",
      primary: "#ff7edb",
      secondary: "#36f9f6",
      info: "#36f9f6",
      success: "#72f1b8",
      warning: "#fede5d",
      error: "#fe4450",
    },
  },
  {
    id: "matrix",
    name: "Matrix",
    palette: {
      background: "#000000",
      surface: "#071a0d",
      border: "#14532d",
      text: "#d1fae5",
      textMuted: "#86efac",
      primary: "#22c55e",
      secondary: "#4ade80",
      info: "#2dd4bf",
      success: "#22c55e",
      warning: "#facc15",
      error: "#f87171",
    },
  },
  {
    id: "sepia",
    name: "Sepia",
    palette: {
      background: "#f4ecd8",
      surface: "#e8dcc0",
      border: "#cbbf9f",
      text: "#3f3527",
      textMuted: "#6b5d49",
      primary: "#7b4f2c",
      secondary: "#76527a",
      info: "#2f6f75",
      success: "#4f772d",
      warning: "#946200",
      error: "#a13d2d",
    },
  },
  {
    id: "light",
    name: "Minimal Light",
    palette: {
      background: "#f7f7f7",
      surface: "#e6e6e6",
      border: "#b8b8b8",
      text: "#202020",
      textMuted: "#666666",
      primary: "#165dbe",
      secondary: "#6f42c1",
      info: "#006d8f",
      success: "#16733c",
      warning: "#8a5a00",
      error: "#b42318",
    },
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    palette: {
      background: "#000000",
      surface: "#111111",
      border: "#ffffff",
      text: "#ffffff",
      textMuted: "#c0c0c0",
      primary: "#00ffff",
      secondary: "#ff00ff",
      info: "#00ffff",
      success: "#00ff00",
      warning: "#ffff00",
      error: "#ff4040",
    },
  },
] as const satisfies readonly ThemeDefinition[];

export type ThemeName = (typeof THEMES)[number]["id"];

const DEFAULT_THEME = THEMES[0];
if (!DEFAULT_THEME) throw new Error("At least one theme is required");

const ThemeContext = createContext<ThemePalette>(DEFAULT_THEME.palette);
const SyntaxContext = createContext<SyntaxStyle | null>(null);

/** Build Markdown and Tree-sitter colors from one semantic theme. */
export function createSyntaxStyle(theme: ThemePalette): SyntaxStyle {
  const color = (value: string) => RGBA.fromHex(value);
  return SyntaxStyle.fromStyles({
    default: { fg: color(theme.text) },
    "markup.heading": { fg: color(theme.primary), bold: true },
    "markup.bold": { fg: color(theme.text), bold: true },
    "markup.italic": { fg: color(theme.textMuted), italic: true },
    "markup.list": { fg: color(theme.secondary) },
    "markup.quote": { fg: color(theme.textMuted), italic: true },
    "markup.raw": { fg: color(theme.success) },
    "markup.link": { fg: color(theme.info), underline: true },
    comment: { fg: color(theme.textMuted), italic: true },
    "comment.documentation": { fg: color(theme.textMuted), italic: true },
    string: { fg: color(theme.success) },
    symbol: { fg: color(theme.success) },
    number: { fg: color(theme.warning) },
    boolean: { fg: color(theme.warning) },
    keyword: { fg: color(theme.secondary), italic: true },
    "keyword.import": { fg: color(theme.secondary) },
    "keyword.type": { fg: color(theme.primary), bold: true },
    "keyword.function": { fg: color(theme.info) },
    function: { fg: color(theme.info) },
    "function.call": { fg: color(theme.info) },
    "function.method": { fg: color(theme.info) },
    "function.method.call": { fg: color(theme.info) },
    type: { fg: color(theme.primary) },
    class: { fg: color(theme.primary), bold: true },
    module: { fg: color(theme.primary) },
    variable: { fg: color(theme.text) },
    "variable.parameter": { fg: color(theme.warning) },
    "variable.member": { fg: color(theme.info) },
    property: { fg: color(theme.info) },
    constant: { fg: color(theme.warning) },
    operator: { fg: color(theme.secondary) },
    "keyword.operator": { fg: color(theme.secondary) },
    punctuation: { fg: color(theme.textMuted) },
    "punctuation.delimiter": { fg: color(theme.textMuted) },
    "punctuation.bracket": { fg: color(theme.textMuted) },
  });
}

interface ThemeProviderProps {
  name: ThemeName;
  children: ReactNode;
}

/** Provide one selected semantic palette to the render tree. */
export function ThemeProvider({ name, children }: ThemeProviderProps) {
  const theme =
    THEMES.find((candidate) => candidate.id === name) ?? DEFAULT_THEME;
  const syntax = useMemo(() => createSyntaxStyle(theme.palette), [theme]);

  useEffect(
    () => () => {
      // Renderables receive replacement styles during the commit before cleanup runs.
      setTimeout(() => syntax.destroy(), 0);
    },
    [syntax],
  );

  return (
    <ThemeContext.Provider value={theme.palette}>
      <SyntaxContext.Provider value={syntax}>{children}</SyntaxContext.Provider>
    </ThemeContext.Provider>
  );
}

/** Read the selected semantic palette. */
export function useTheme(): ThemePalette {
  return useContext(ThemeContext);
}

/** Read the theme-owned shared Markdown/Tree-sitter style. */
export function useSyntaxStyle(): SyntaxStyle {
  const syntax = useContext(SyntaxContext);
  if (!syntax) throw new Error("Syntax style requires ThemeProvider");
  return syntax;
}
