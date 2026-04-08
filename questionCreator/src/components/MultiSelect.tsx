import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { PINK, CREAM, MUTED, PEACH } from "../lib/colors.js";

/** Item for multi-select list */
export interface MultiSelectItem {
  /** Display label */
  label: string;
  /** Unique value */
  value: string;
}

/** Props for MultiSelect component */
interface MultiSelectProps {
  /** Available items */
  items: MultiSelectItem[];
  /** Callback when user confirms with SPACE */
  onSubmit: (selected: string[]) => void;
}

/**
 * Custom multi-select component with ENTER to toggle, SPACE to confirm.
 *
 * @param props - Component props
 * @returns React element
 */
export function MultiSelect({ items, onSubmit }: MultiSelectProps): React.ReactElement {
  /** Currently focused index */
  const [cursor, setCursor] = useState(0);
  /** Set of selected item values */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((prev) => (prev > 0 ? prev - 1 : items.length - 1));
    }
    if (key.downArrow) {
      setCursor((prev) => (prev < items.length - 1 ? prev + 1 : 0));
    }
    if (key.return) {
      /** Current item value */
      const val = items[cursor].value;
      setSelected((prev) => {
        /** Cloned set */
        const next = new Set(prev);
        if (val === "__all__") {
          if (next.has("__all__")) {
            next.clear();
          } else {
            next.clear();
            for (const item of items) next.add(item.value);
          }
        } else {
          if (next.has(val)) {
            next.delete(val);
            next.delete("__all__");
          } else {
            next.add(val);
          }
        }
        return next;
      });
    }
    if (input === " ") {
      if (selected.size > 0) {
        onSubmit([...selected].filter((v) => v !== "__all__"));
      }
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        /** Whether this item is focused */
        const focused = i === cursor;
        /** Whether this item is selected */
        const checked = selected.has(item.value);

        return (
          <Box key={item.value}>
            <Text color={PINK}>{focused ? " ❯ " : "   "}</Text>
            <Text color={checked ? PEACH : MUTED}>{checked ? "◉ " : "○ "}</Text>
            <Text color={focused ? CREAM : MUTED}>{item.label}</Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text color={MUTED}>ENTER: 선택/해제  SPACE: 확인  ESC: 뒤로</Text>
      </Box>
    </Box>
  );
}
