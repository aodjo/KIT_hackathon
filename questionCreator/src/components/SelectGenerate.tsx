import React, { useState, useMemo, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import {
  loadCurriculumData,
  getSchoolLevels,
  getDomains,
  getGrades,
  getConcepts,
} from "../lib/curriculum.js";
import { generateBatch } from "../lib/generator.js";
import { GenerateProgress } from "./GenerateProgress.js";
import type { FlatConcept, GenerationProgress, CurriculumData } from "../types.js";

/** Props for SelectGenerate component */
interface SelectGenerateProps {
  /** Callback to return to the main menu */
  onBack: () => void;
}

/** Selection flow steps */
type Step = "school" | "domain" | "grade" | "concept" | "input" | "generating" | "done";

/** Generic select item */
interface SelectItem {
  /** Display label */
  label: string;
  /** Value */
  value: string;
}

/**
 * Selective generation screen - user picks school/domain/grade/concept.
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
  /** Selected domain */
  const [domain, setDomain] = useState("");
  /** Selected grade */
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

  /** Domain options for selected school */
  const domainItems = useMemo<SelectItem[]>(
    () => (school ? getDomains(data, school).map((d) => ({ label: d, value: d })) : []),
    [data, school],
  );

  /** Grade options for selected school + domain */
  const gradeItems = useMemo<SelectItem[]>(
    () =>
      school && domain
        ? getGrades(data, school, domain).map((g) => ({ label: g, value: g }))
        : [],
    [data, school, domain],
  );

  /** Concept options for selected school + domain + grade */
  const conceptItems = useMemo<SelectItem[]>(
    () =>
      school && domain && grade
        ? [
            { label: "전체 선택", value: "__all__" },
            ...getConcepts(data, school, domain, grade).map((c) => ({
              label: `[${c.id}] ${c.curriculum.join(", ")}`,
              value: c.id,
            })),
          ]
        : [],
    [data, school, domain, grade],
  );

  useInput((input, key) => {
    if (step === "done" && key.return) {
      onBack();
    }
    if (key.escape) {
      if (step === "school") onBack();
      else if (step === "domain") { setStep("school"); setSchool(""); }
      else if (step === "grade") { setStep("domain"); setDomain(""); }
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
  const breadcrumb = [school, domain, grade].filter(Boolean).join(" > ");

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">선택 생성</Text>
        {breadcrumb && (
          <Text dimColor> — {breadcrumb}</Text>
        )}
      </Box>

      {step === "school" && (
        <>
          <Text marginBottom={1}>학교급을 선택하세요:</Text>
          <SelectInput
            items={schoolItems}
            onSelect={(item: SelectItem) => { setSchool(item.value); setStep("domain"); }}
          />
        </>
      )}

      {step === "domain" && (
        <>
          <Text marginBottom={1}>영역을 선택하세요:</Text>
          <SelectInput
            items={domainItems}
            onSelect={(item: SelectItem) => { setDomain(item.value); setStep("grade"); }}
          />
        </>
      )}

      {step === "grade" && (
        <>
          <Text marginBottom={1}>학년을 선택하세요:</Text>
          <SelectInput
            items={gradeItems}
            onSelect={(item: SelectItem) => { setGrade(item.value); setStep("concept"); }}
          />
        </>
      )}

      {step === "concept" && (
        <>
          <Text marginBottom={1}>개념을 선택하세요:</Text>
          <SelectInput
            items={conceptItems}
            onSelect={(item: SelectItem) => {
              if (item.value === "__all__") {
                setSelectedConcepts(getConcepts(data, school, domain, grade));
              } else {
                /** Matched concept */
                const found = getConcepts(data, school, domain, grade).find(
                  (c) => c.id === item.value,
                );
                if (found) setSelectedConcepts([found]);
              }
              setStep("input");
            }}
          />
        </>
      )}

      {step === "input" && (
        <>
          <Box marginBottom={1}>
            <Text>
              선택된 개념: <Text color="yellow">{selectedConcepts.length}</Text>개
            </Text>
          </Box>
          <Box>
            <Text>난이도별 문제 수: </Text>
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
        <Text dimColor>ESC: 뒤로가기</Text>
      </Box>
    </Box>
  );
}
