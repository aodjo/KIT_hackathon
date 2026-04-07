import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { loadCurriculumData, flattenConcepts } from "../lib/curriculum.js";
import { generateBatch } from "../lib/generator.js";
import { GenerateProgress } from "./GenerateProgress.js";
import type { GenerationProgress } from "../types.js";

/** Props for BulkGenerate component */
interface BulkGenerateProps {
  /** Callback to return to the main menu */
  onBack: () => void;
}

/** Internal step state */
type Step = "input" | "generating" | "done";

/**
 * Bulk generation screen - generates questions for all concepts.
 *
 * @param props - Component props
 * @returns React element
 */
export function BulkGenerate({ onBack }: BulkGenerateProps): React.ReactElement {
  /** Current step */
  const [step, setStep] = useState<Step>("input");
  /** User-entered question count per difficulty */
  const [countInput, setCountInput] = useState("3");
  /** Generation progress state */
  const [progress, setProgress] = useState<GenerationProgress>({
    current: 0,
    total: 0,
    currentLabel: "",
    questionsGenerated: 0,
  });

  /**
   * Start generation after user confirms count.
   *
   * @param value - Input string value
   */
  const handleSubmit = useCallback(async (value: string) => {
    /** Parsed count */
    const count = parseInt(value, 10);
    if (isNaN(count) || count < 1) return;

    setStep("generating");

    /** All curriculum data */
    const data = loadCurriculumData();
    /** Flattened concept list */
    const concepts = flattenConcepts(data);

    setProgress((p) => ({ ...p, total: concepts.length }));

    await generateBatch(concepts, count, (current, total, label, generated) => {
      setProgress({ current, total, currentLabel: label, questionsGenerated: generated });
    });

    setStep("done");
  }, []);

  useInput((input, key) => {
    if (step === "done" && key.return) {
      onBack();
    }
    if (key.escape) {
      onBack();
    }
  });

  if (step === "input") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">전체 생성</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>모든 개념에 대해 난이도별(상/중/하) 문제를 생성합니다.</Text>
        </Box>
        <Box>
          <Text>난이도별 문제 수: </Text>
          <TextInput
            value={countInput}
            onChange={setCountInput}
            onSubmit={handleSubmit}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>ESC: 뒤로가기</Text>
        </Box>
      </Box>
    );
  }

  return (
    <GenerateProgress progress={progress} done={step === "done"} />
  );
}
