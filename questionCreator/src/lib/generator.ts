import { z } from "zod";
import { callGemini } from "./gemini.js";
import { insertQuestions, type InsertQuestionParams } from "./db.js";
import { debugLine } from "./debug.js";
import type { FlatConcept, Difficulty } from "../types.js";

/** Zod schema for choices object {"1":"...", "2":"...", ...} */
const choicesSchema = z.object({
  "1": z.string(),
  "2": z.string(),
  "3": z.string(),
  "4": z.string(),
  "5": z.string(),
});

/** Zod schema for a single generated question */
const questionSchema = z.object({
  type: z.enum(["객관식", "주관식"]),
  question: z.string(),
  choices: choicesSchema.nullable(),
  answer: z.union([z.enum(["1", "2", "3", "4", "5"]), z.array(z.string())]),
  explanation: z.string(),
});

/** Zod schema for validating Gemini response */
const responseSchema = z.object({
  questions: z.array(questionSchema),
});

/** Hand-written JSON schema for Gemini structured output */
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["객관식", "주관식"], description: "객관식 or 주관식" },
          question: { type: "string", description: "Question text in Korean" },
          choices: {
            type: ["object", "null"],
            properties: {
              "1": { type: "string", description: "Choice 1" },
              "2": { type: "string", description: "Choice 2" },
              "3": { type: "string", description: "Choice 3" },
              "4": { type: "string", description: "Choice 4" },
              "5": { type: "string", description: "Choice 5" },
            },
            required: ["1", "2", "3", "4", "5"],
            description: "5 choices as object for 객관식, null for 주관식",
          },
          answer: {
            oneOf: [
              { type: "string", enum: ["1", "2", "3", "4", "5"], description: "Choice number for 객관식" },
              { type: "array", items: { type: "string" }, description: "Answer array for 주관식" },
            ],
          },
          explanation: { type: "string", description: "Step-by-step solution in Korean" },
        },
        required: ["type", "question", "choices", "answer", "explanation"],
      },
    },
  },
  required: ["questions"],
};

/** All difficulty levels */
const DIFFICULTIES: Difficulty[] = ["하", "중", "상"];

/** Difficulty descriptions for the prompt */
const DIFFICULTY_DESC: Record<Difficulty, string> = {
  하: "쉬움 (기본 개념 확인, 단순 계산)",
  중: "보통 (개념 응용, 다단계 풀이)",
  상: "어려움 (심화 응용, 복합 개념, 서술형 추론)",
};

/** Single topic unit for generation */
interface TopicUnit {
  /** Parent concept */
  concept: FlatConcept;
  /** Individual curriculum topic */
  topic: string;
}

/**
 * Expand concepts into individual topic units.
 *
 * @param concepts - Array of flat concepts
 * @returns Array of topic units (one per curriculum topic)
 */
function expandTopics(concepts: FlatConcept[]): TopicUnit[] {
  /** Accumulated topic units */
  const units: TopicUnit[] = [];
  for (const concept of concepts) {
    for (const topic of concept.curriculum) {
      units.push({ concept, topic });
    }
  }
  return units;
}

/**
 * Build a prompt for a single topic at a single difficulty.
 *
 * @param unit - Topic unit (concept + single topic)
 * @param difficulty - Difficulty level
 * @param pairCount - Number of question pairs
 * @returns Prompt string
 */
function buildPrompt(
  unit: TopicUnit,
  difficulty: Difficulty,
  pairCount: number,
): string {
  const { concept, topic } = unit;
  return `You are a Korean math question generator for the Korean K-12 education system.

Generate exactly ${pairCount} pairs of math questions. Each pair consists of 1 객관식 (multiple choice) + 1 주관식 (short answer) = ${pairCount * 2} questions total.

**Context:**
- School level: ${concept.schoolLevel}
- Subject area: ${concept.domain}
- Grade: ${concept.grade}
- Topic: ${topic}
${concept.requirements.length > 0 ? `- Prerequisite concepts: ${concept.requirements.join(", ")}` : ""}

**Difficulty: ${difficulty} (${DIFFICULTY_DESC[difficulty]})**

**Requirements:**
- Generate ${pairCount} 객관식 (multiple choice) questions with exactly 5 options labeled ①, ②, ③, ④, ⑤
- Generate ${pairCount} 주관식 (short answer) questions
- Alternate: 객관식, 주관식, 객관식, 주관식, ...
- All questions MUST be about "${topic}" specifically
- All questions must be in Korean
- Questions must strictly match the specified grade level and difficulty
- Provide clear, step-by-step explanations in Korean
- For 객관식: choices must be an object like {"1":"보기내용", "2":"보기내용", "3":"보기내용", "4":"보기내용", "5":"보기내용"}, answer must be the correct choice number as string (e.g., "3")
- For 주관식: choices must be null, answer must be an array of strings (e.g., ["12", "3/4"])
`;
}

/**
 * Generate questions for a single topic at a single difficulty.
 *
 * @param unit - Topic unit
 * @param difficulty - Difficulty level
 * @param pairCount - Number of question pairs
 * @returns Number of questions saved to DB
 */
async function generateOne(
  unit: TopicUnit,
  difficulty: Difficulty,
  pairCount: number,
): Promise<number> {
  /** Prompt for Gemini */
  const prompt = buildPrompt(unit, difficulty, pairCount);

  /** Raw JSON response from Gemini */
  const raw = await callGemini(prompt, RESPONSE_JSON_SCHEMA);

  /** Validated response */
  const parsed = responseSchema.parse(JSON.parse(raw));

  /** Database insert params */
  const params: InsertQuestionParams[] = parsed.questions.map((q) => ({
    concept_id: unit.concept.id,
    school_level: unit.concept.schoolLevel,
    domain: unit.concept.domain,
    grade: unit.concept.grade,
    curriculum_topic: unit.topic,
    difficulty,
    type: q.type,
    question: q.question,
    choices: q.choices ? JSON.stringify(q.choices) : null,
    answer: Array.isArray(q.answer) ? JSON.stringify(q.answer) : q.answer,
    explanation: q.explanation,
  }));

  return insertQuestions(params);
}

/** Callback for progress updates */
export type ProgressCallback = (
  current: number,
  total: number,
  label: string,
  questionsGenerated: number,
) => void;

/**
 * Generate questions for multiple concepts with progress tracking.
 * Iterates per topic × per difficulty (total = topics * 3).
 *
 * @param concepts - Array of concepts to process
 * @param pairCount - Pairs per difficulty per topic
 * @param onProgress - Progress callback
 * @returns Total number of questions generated
 */
export async function generateBatch(
  concepts: FlatConcept[],
  pairCount: number,
  onProgress?: ProgressCallback,
): Promise<number> {
  /** Expanded topic units */
  const units = expandTopics(concepts);
  /** Total work items = topics × 3 difficulties */
  const totalSteps = units.length * DIFFICULTIES.length;
  /** Current step index */
  let step = 0;
  /** Total questions generated */
  let totalGenerated = 0;

  for (const unit of units) {
    for (const difficulty of DIFFICULTIES) {
      /** Progress label */
      const label = `[${unit.concept.id}] ${unit.topic} (${difficulty})`;

      onProgress?.(step, totalSteps, label, totalGenerated);

      try {
        const count = await generateOne(unit, difficulty, pairCount);
        totalGenerated += count;
      } catch (err) {
        debugLine(`[Error] ${label}: ${err}`);
      }

      step++;
    }
  }

  onProgress?.(totalSteps, totalSteps, "완료", totalGenerated);
  return totalGenerated;
}
