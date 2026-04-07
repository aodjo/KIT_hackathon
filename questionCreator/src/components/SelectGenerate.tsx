import React, { useState, useMemo, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import {
  loadCurriculumData,
  getSchoolLevels,
  getGrades,
  getConceptsByGrade,
} from "../lib/curriculum.js";
import { generateBatch } from "../lib/generator.js";
import { GenerateProgress } from "./GenerateProgress.js";
import type { FlatConcept, GenerationProgress, CurriculumData } from "../types.js";
import { PINK, CREAM, MUTED, LAVENDER } from "../lib/colors.js";

/** Props for SelectGenerate component */
interface SelectGenerateProps {
  /** Callback to return to the main menu */
  onBack: () => void;
}

/** Selection flow: school -> grade -> concept -> input -> generating -> done */
type Step = "school" | "grade" | "concept" | "input" | "generating" | "done";

/** Generic select item */
interface SelectItem {
  /** Display label */
  label: string;
  /** Value */
  value: string;
}

/**
 * Selective generation screen - school -> grade -> concept list.
 *
 * @param props - Component props
 * @returns React element
 */
export function SelectGenerate({ onBack }: SelectGenerateProps): React.ReactElement {
  /** Loaded curriculum data */
  const data = useMemo<CurriculumData>(() => loadCurriculumData(), []);

  /** Current selection step */
  const [step, setStep] = useState<Step>("school");
  /** Selected school level */
  const [school, setSchool] = useState("");
  /** Selected grade/course */
  const [grade, setGrade] = useState("");
  /** Selected concepts */
  const [selectedConcepts, setSelectedConcepts] = useState<FlatConcept[]>([]);
  /** Question count input */
  const [countInput, setCountInput] = useState("3");
  /** Generation progress */
  const [progress, setProgress] = useState<GenerationProgress>({
    current: 0,
    total: 0,
    currentLabel: "",
    questionsGenerated: 0,
  });

  /** School level options */
  const schoolItems = useMemo<SelectItem[]>(
    () => getSchoolLevels(data).map((s) => ({ label: s, value: s })),
    [data],
  );

  /** Grade options for selected school */
  const gradeItems = useMemo<SelectItem[]>(
    () => (school ? getGrades(data, school).map((g) => ({ label: g, value: g })) : []),
    [data, school],
  );

  /** All concepts for the selected grade, labeled as [domain] curriculum */
  const allConcepts = useMemo<FlatConcept[]>(
    () => (school && grade ? getConceptsByGrade(data, school, grade) : []),
    [data, school, grade],
  );

  /** Concept select items with domain prefix */
  const conceptItems = useMemo<SelectItem[]>(() => {
    if (!allConcepts.length) return [];
    return [
      { label: "전체 선택", value: "__all__" },
      ...allConcepts.map((c) => ({
        label: `[${c.domain}] ${c.curriculum.join(", ")}`,
        value: c.id,
      })),
    ];
  }, [allConcepts]);

  useInput((input, key) => {
    if (step === "done" && key.return) {
      onBack();
    }
    if (key.escape) {
      if (step === "school") onBack();
      else if (step === "grade") { setStep("school"); setSchool(""); }
      else if (step === "concept") { setStep("grade"); setGrade(""); }
      else if (step === "input") { setStep("concept"); }
    }
  });

  /**
   * Handle count submit and start generation.
   *
   * @param value - Input count string
   */
  const handleCountSubmit = useCallback(
    async (value: string) => {
      /** Parsed count */
      const count = parseInt(value, 10);
      if (isNaN(count) || count < 1) return;

      setStep("generating");
      setProgress((p) => ({ ...p, total: selectedConcepts.length }));

      await generateBatch(selectedConcepts, count, (current, total, label, generated) => {
        setProgress({ current, total, currentLabel: label, questionsGenerated: generated });
      });

      setStep("done");
    },
    [selectedConcepts],
  );

  /** Breadcrumb display */
  const breadcrumb = [school, grade].filter(Boolean).join(" > ");

  /** Shared select indicator */
  const indicator = ({ isSelected }: { isSelected: boolean }) => (
    <Text color={PINK}>{isSelected ? " ❯ " : "   "}</Text>
  );

  /** Shared select item renderer */
  const item = ({ isSelected, label }: { isSelected: boolean; label: string }) => (
    <Text color={isSelected ? CREAM : MUTED}>{label}</Text>
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color={PINK}>선택 생성</Text>
        {breadcrumb && (
          <Text color={MUTED}> — {breadcrumb}</Text>
        )}
      </Box>

      {step === "school" && (
        <>
          <Text color={CREAM}>학교급을 선택하세요:</Text>
          <SelectInput
            items={schoolItems}
            onSelect={(i: SelectItem) => { setSchool(i.value); setStep("grade"); }}
            indicatorComponent={indicator}
            itemComponent={item}
          />
        </>
      )}

      {step === "grade" && (
        <>
          <Text color={CREAM}>학년/과정을 선택하세요:</Text>
          <SelectInput
            items={gradeItems}
            onSelect={(i: SelectItem) => { setGrade(i.value); setStep("concept"); }}
            indicatorComponent={indicator}
            itemComponent={item}
          />
        </>
      )}

      {step === "concept" && (
        <>
          <Text color={CREAM}>개념을 선택하세요:</Text>
          <SelectInput
            items={conceptItems}
            onSelect={(i: SelectItem) => {
              if (i.value === "__all__") {
                setSelectedConcepts(allConcepts);
              } else {
                /** Matched concept */
                const found = allConcepts.find((c) => c.id === i.value);
                if (found) setSelectedConcepts([found]);
              }
              setStep("input");
            }}
            indicatorComponent={indicator}
            itemComponent={item}
          />
        </>
      )}

      {step === "input" && (
        <>
          <Box marginBottom={1}>
            <Text color={CREAM}>
              선택된 개념: <Text color={LAVENDER}>{selectedConcepts.length}</Text>개
            </Text>
          </Box>
          <Box>
            <Text color={CREAM}>난이도별 문제 수: </Text>
            <TextInput
              value={countInput}
              onChange={setCountInput}
              onSubmit={handleCountSubmit}
            />
          </Box>
        </>
      )}

      {(step === "generating" || step === "done") && (
        <GenerateProgress progress={progress} done={step === "done"} />
      )}

      <Box marginTop={1}>
        <Text color={MUTED}>ESC: 뒤로가기</Text>
      </Box>
    </Box>
  );
}
