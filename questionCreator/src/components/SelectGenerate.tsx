import React, { useState, useMemo, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import {
  loadCurriculumData,
  getSchoolLevels,
  getGrades,
  getDomains,
  getConcepts,
} from "../lib/curriculum.js";
import { generateBatch } from "../lib/generator.js";
import { GenerateProgress } from "./GenerateProgress.js";
import type { FlatConcept, GenerationProgress, CurriculumData } from "../types.js";
import { PINK, PEACH, CREAM, MUTED, LAVENDER } from "../lib/colors.js";

/** Props for SelectGenerate component */
interface SelectGenerateProps {
  /** Callback to return to the main menu */
  onBack: () => void;
}

/** Selection flow: school -> grade -> domain -> concept -> input -> generating -> done */
type Step = "school" | "grade" | "domain" | "concept" | "input" | "generating" | "done";

/** Generic select item */
interface SelectItem {
  /** Display label */
  label: string;
  /** Value */
  value: string;
}

/**
 * Selective generation screen - user picks school/grade/domain/concept.
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
  /** Selected domain */
  const [domain, setDomain] = useState("");
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

  /** Grade options for selected school (across all domains) */
  const gradeItems = useMemo<SelectItem[]>(
    () => (school ? getGrades(data, school).map((g) => ({ label: g, value: g })) : []),
    [data, school],
  );

  /** Domain options for selected school + grade (only domains with content) */
  const domainItems = useMemo<SelectItem[]>(
    () =>
      school && grade
        ? getDomains(data, school, grade).map((d) => ({ label: d, value: d }))
        : [],
    [data, school, grade],
  );

  /** Concept options for selected school + grade + domain */
  const conceptItems = useMemo<SelectItem[]>(
    () =>
      school && grade && domain
        ? [
            { label: "전체 선택", value: "__all__" },
            ...getConcepts(data, school, domain, grade).map((c) => ({
              label: `[${c.id}] ${c.curriculum.join(", ")}`,
              value: c.id,
            })),
          ]
        : [],
    [data, school, grade, domain],
  );

  useInput((input, key) => {
    if (step === "done" && key.return) {
      onBack();
    }
    if (key.escape) {
      if (step === "school") onBack();
      else if (step === "grade") { setStep("school"); setSchool(""); }
      else if (step === "domain") { setStep("grade"); setGrade(""); }
      else if (step === "concept") { setStep("domain"); setDomain(""); }
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
  const breadcrumb = [school, grade, domain].filter(Boolean).join(" > ");

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
            onSelect={(i: SelectItem) => { setGrade(i.value); setStep("domain"); }}
            indicatorComponent={indicator}
            itemComponent={item}
          />
        </>
      )}

      {step === "domain" && (
        <>
          <Text color={CREAM}>영역을 선택하세요:</Text>
          <SelectInput
            items={domainItems}
            onSelect={(i: SelectItem) => { setDomain(i.value); setStep("concept"); }}
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
                setSelectedConcepts(getConcepts(data, school, domain, grade));
              } else {
                /** Matched concept */
                const found = getConcepts(data, school, domain, grade).find(
                  (c) => c.id === i.value,
                );
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
