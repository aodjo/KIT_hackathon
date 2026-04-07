import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { Screen } from "../types.js";
import { getQuestionCount } from "../lib/db.js";

/** Props for MainMenu component */
interface MainMenuProps {
  /** Callback when a screen is selected */
  onSelect: (screen: Screen) => void;
}

/** Menu item shape */
interface MenuItem {
  /** Display label */
  label: string;
  /** Screen value */
  value: Screen;
}

/** Available menu items */
const MENU_ITEMS: MenuItem[] = [
  { label: "📦 전체 생성 (모든 개념)", value: "bulk" },
  { label: "🔍 선택 생성 (개념 선택)", value: "select" },
  { label: "🚪 종료", value: "exit" },
];

/**
 * Main menu component for the question creator CLI.
 *
 * @param props - Component props
 * @returns React element
 */
export function MainMenu({ onSelect }: MainMenuProps): React.ReactElement {
  /** Current total question count in DB */
  const count = getQuestionCount();

  /**
   * Handle menu item selection.
   *
   * @param item - Selected menu item
   */
  const handleSelect = (item: MenuItem) => {
    onSelect(item.value);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        marginBottom={1}
        borderStyle="double"
        borderColor="cyan"
        paddingX={2}
        justifyContent="center"
      >
        <Text bold color="cyan">수학 문제 출제 AI Agent</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          DB 저장된 문제: <Text color="yellow">{count}</Text>개
        </Text>
      </Box>

      <SelectInput items={MENU_ITEMS} onSelect={handleSelect} />
    </Box>
  );
}
