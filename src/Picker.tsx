import type { SelectOption } from "@opentui/core";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useMemo, useState } from "react";
import { useTheme } from "./theme.tsx";

export interface PickerOption {
  value: string;
  name: string;
  description?: string;
}

interface PickerProps {
  title: string;
  options: readonly PickerOption[];
  selectedValue?: string;
  searchable?: boolean;
  onSelect: (value: string) => void;
}

function pickerSearchText(option: PickerOption): string {
  return `${option.name} ${option.description ?? ""}`.toLocaleLowerCase();
}

function fuzzyScore(option: PickerOption, query: string): number | undefined {
  const haystack = pickerSearchText(option);
  let position = -1;
  let gaps = 0;
  for (const character of query) {
    const next = haystack.indexOf(character, position + 1);
    if (next < 0) return undefined;
    if (position >= 0) gaps += next - position - 1;
    position = next;
  }
  return haystack.length + gaps;
}

export function fuzzyPickerOptions(
  options: readonly PickerOption[],
  rawQuery: string,
): readonly PickerOption[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return options;
  const contiguous = options.filter((option) =>
    pickerSearchText(option).includes(query),
  );
  if (contiguous.length > 0) return contiguous;
  return options
    .map((option, index) => ({
      option,
      index,
      score: fuzzyScore(option, query),
    }))
    .filter(
      (entry): entry is typeof entry & { score: number } =>
        entry.score !== undefined,
    )
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.option);
}

/** Keyboard-first picker with optional fuzzy type-to-filter search. */
export function Picker({
  title,
  options,
  selectedValue,
  searchable = false,
  onSelect,
}: PickerProps) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const visibleOptions = useMemo(
    () => (searchable ? fuzzyPickerOptions(options, query) : options),
    [options, query, searchable],
  );
  const selectOptions: SelectOption[] = visibleOptions.map((option) => ({
    name: option.name,
    description: option.description ?? "",
    value: option.value,
  }));
  const selectedIndex = Math.max(
    0,
    visibleOptions.findIndex((option) => option.value === selectedValue),
  );

  useKeyboard((key) => {
    if (!searchable || key.ctrl || key.meta || key.super) return;
    if (key.name === "backspace") {
      key.preventDefault();
      key.stopPropagation();
      setQuery((current) => [...current].slice(0, -1).join(""));
      return;
    }
    if (
      key.sequence &&
      [...key.sequence].length === 1 &&
      // eslint-disable-next-line no-control-regex -- deliberately rejects terminal control sequences
      !/[\x00-\x1f\x7f]/u.test(key.sequence)
    ) {
      key.preventDefault();
      key.stopPropagation();
      setQuery((current) => current + key.sequence);
    }
  });

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
        {title}
      </text>
      {searchable && (
        <text fg={query ? theme.text : theme.textMuted}>
          Search: {query || "type to filter…"}
        </text>
      )}
      {selectOptions.length === 0 ? (
        <text fg={theme.error}>No options available</text>
      ) : (
        <select
          options={selectOptions}
          selectedIndex={selectedIndex}
          focused={true}
          width="100%"
          flexGrow={1}
          wrapSelection={true}
          showDescription={true}
          selectedBackgroundColor={theme.border}
          selectedTextColor={theme.text}
          onSelect={(_, option) => {
            if (typeof option?.value === "string") onSelect(option.value);
          }}
        />
      )}
      <text fg={theme.textMuted}>
        {searchable ? "Type filter  Backspace edit  " : ""}↑/↓ select Enter
        confirm Esc cancel
      </text>
    </box>
  );
}
