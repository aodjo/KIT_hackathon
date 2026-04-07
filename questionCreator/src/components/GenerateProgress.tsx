import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { GenerationProgress } from "../types.js";
import { PINK, PEACH, CREAM, MUTED, LAVENDER } from "../lib/colors.js";

/** Props for GenerateProgress component */
interface GenerateProgressProps {
  /** Current progress state */
  progress: GenerationProgress;
  /** Whether generation is complete */
  done: boolean;
}

/**
 * Build a text-based progress bar.
 *
 * @param current - Current value
 * @param total - Total value
 * @param width - Bar width in characters
 * @returns Progress bar string
 */
function progressBar(current: number, total: number, width: number = 30): string {
  if (total === 0) return "░".repeat(width);

  /** Filled portion ratio */
  const ratio = Math.min(current / total, 1);
  /** Number of filled blocks */
  const filled = Math.round(ratio * width);
  /** Number of empty blocks */
  const empty = width - filled;

  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Progress display component during question generation.
 *
 * @param props - Component props
 * @returns React element
 */
export function GenerateProgress({
  progress,
  done,
}: GenerateProgressProps): React.ReactElement {
  /** Percentage value */
  const pct = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <Box flexDirection="column" padding={1}>
      {!done ? (
        <>
          <Box marginBottom={1}>
            <Text color={PINK}>
              <Spinner type="dots" />
            </Text>
            <Text color={CREAM}> 문제 생성 중...</Text>
          </Box>

          <Box>
            <Text color={PINK}>
              {progressBar(progress.current, progress.total)}
            </Text>
            <Text color={PEACH}> {pct}% </Text>
            <Text color={MUTED}>
              ({progress.current}/{progress.total})
            </Text>
          </Box>

          <Box marginTop={1}>
            <Text color={MUTED}>현재: {progress.currentLabel}</Text>
          </Box>

          <Box marginTop={1}>
            <Text color={CREAM}>
              생성된 문제: <Text color={LAVENDER}>{progress.questionsGenerated}</Text>개
            </Text>
          </Box>
        </>
      ) : (
        <>
          <Box marginBottom={1}>
            <Text color={PINK} bold>
              ✓ 생성 완료!
            </Text>
          </Box>
          <Box>
            <Text color={CREAM}>
              총 <Text color={PEACH} bold>{progress.questionsGenerated}</Text>개 문제가
              DB에 저장되었습니다.
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={MUTED}>Enter를 눌러 메인 메뉴로 돌아갑니다.</Text>
          </Box>
        </>
      )}
    </Box>
  );
}
