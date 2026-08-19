import { useCallback, useEffect, useMemo, useState } from "react";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "./theme.tsx";

interface DirectoryPickerProps {
  initialDirectory: string;
  onSelect: (directory: string) => void;
}

const UP_VALUE = "__up__";
const SELECT_VALUE = "__select__";

interface DirectoryListing {
  directories: string[];
  error: string | null;
}

/** Read one directory's immediate subdirectories, sorted case-insensitively. */
async function listDirectories(path: string): Promise<DirectoryListing> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    return { directories, error: null };
  } catch (error) {
    return {
      directories: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Keyboard-first directory browser for choosing the workspace directory.
 * Enter on a subdirectory descends into it; Enter on the "select" row commits
 * the current directory; ".." climbs to the parent. Esc is handled by the
 * parent (it closes the overlay).
 */
export function DirectoryPicker({
  initialDirectory,
  onSelect,
}: DirectoryPickerProps) {
  const theme = useTheme();
  const [currentDir, setCurrentDir] = useState(initialDirectory);
  const [listing, setListing] = useState<DirectoryListing>({
    directories: [],
    error: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listDirectories(currentDir).then((result) => {
      if (!cancelled) {
        setListing(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentDir]);

  const atRoot = currentDir === dirname(currentDir);
  const options = useMemo(() => {
    const opts: { value: string; name: string; description: string }[] = [];
    if (!atRoot) {
      opts.push({
        value: UP_VALUE,
        name: "..",
        description: "parent directory",
      });
    }
    opts.push({
      value: SELECT_VALUE,
      name: "✓ Select this directory",
      description: currentDir,
    });
    for (const dir of listing.directories) {
      opts.push({
        value: join(currentDir, dir),
        name: `${dir}/`,
        description: "directory",
      });
    }
    return opts;
  }, [atRoot, currentDir, listing.directories]);

  const handleSelect = useCallback(
    (value: string) => {
      if (value === UP_VALUE) {
        setCurrentDir((current) => dirname(current));
      } else if (value === SELECT_VALUE) {
        onSelect(currentDir);
      } else {
        setCurrentDir(value);
      }
    },
    [currentDir, onSelect],
  );

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        width: "100%",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.secondary,
        paddingX: 2,
        paddingY: 1,
        gap: 1,
      }}
    >
      <text fg={theme.secondary} attributes={TextAttributes.BOLD}>
        Select workspace directory
      </text>
      <text fg={theme.text}>{currentDir}</text>
      {loading ? (
        <text fg={theme.textMuted}>Loading…</text>
      ) : listing.error !== null ? (
        <text fg={theme.error}>{listing.error}</text>
      ) : (
        <select
          key={currentDir}
          options={options.map((option) => ({
            name: option.name,
            description: option.description,
            value: option.value,
          }))}
          selectedIndex={0}
          focused={true}
          width="100%"
          flexGrow={1}
          wrapSelection={true}
          showDescription={true}
          selectedBackgroundColor={theme.border}
          selectedTextColor={theme.text}
          onSelect={(_, option) => {
            if (typeof option?.value === "string") handleSelect(option.value);
          }}
        />
      )}
      <text fg={theme.textMuted}>
        ↑/↓ navigate Enter open or select Esc cancel
      </text>
    </box>
  );
}
