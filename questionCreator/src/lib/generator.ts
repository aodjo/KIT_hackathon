import { callGemini } from "./gemini.js";
import { insertQuestions, type InsertQuestionParams } from "./db.js";
import type {
  FlatConcept,
  Difficulty,
  GeminiResponse,
  GeneratedQuestion,
} from "../types.js";

/** All difficulty levels */
const DIFFICULTIES: Difficulty[] = ["하", "중", "상"];

/** Difficulty descriptions for the prompt */
const DIFFICULTY_DESC: Record<Difficulty, string> = {
  하: "쉬움 (기본 개념 확인, 단순 계산)",
  중: "보통 (개념 응용, 다단계 풀이)",
  상: "어려움 (심화 응용, 복합 개념, 서술형 추론)",
};

/**
 * Build a prompt for Gemini to generate math questions.
 *
 * @param concept - Flat concept with full context
 * @param difficulty - Difficulty level
 * @param count - Number of questions to generate
 * @returns Prompt string
 */
function buildPrompt(
  concept: FlatConcept,
  difficulty: Difficulty,
  count: number,
): string {
  /** Number of multiple choice questions */
  const mcCount = Math.ceil(count / 2);
  /** Number of short answer questions */
  const saCount = count - mcCount;

  return `You are a Korean math question generator for the Korean K-12 education system.

Generate exactly ${count} math questions with these specifications:

**Context:**
- School level: ${concept.schoolLevel}
- Subject area: ${concept.domain}
- Grade: ${concept.grade}
- Concept ID: ${concept.id}
- Topics: ${concept.curriculum.join(", ")}
${concept.requirements.length > 0 ? `- Prerequisite concepts: ${concept.requirements.join(", ")}` : ""}

**Difficulty: ${difficulty} (${DIFFICULTY_DESC[difficulty]})**

**Requirements:**
- Generate ${mcCount} 객관식 (multiple choice) questions with exactly 5 options labeled ①, ②, ③, ④, ⑤
- Generate ${saCount} 주관식 (short answer) questions
- All questions must be in Korean
- Questions must strictly match the specified grade level and difficulty
- Each question must test the listed curriculum topics
- Provide clear, step-by-step explanations in Korean
- For 객관식, the answer field must be the correct option label (e.g., "③")
- For 주관식, the answer field must be the exact answer value

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "type": "객관식",
      "question": "question text here",
      "choices": ["① option1", "② option2", "③ option3", "④ option4", "⑤ option5"],
      "answer": "②",
      "explanation": "step by step solution in Korean"
    },
    {
      "type": "주관식",
      "question": "question text here",
      "choices": null,
      "answer": "answer value",
      "explanation": "step by step solution in Korean"
    }
  ]
}`;
}

/**
 * Parse Gemini response JSON into GeneratedQuestion array.
 *
 * @param raw - Raw JSON string from Gemini
 * @returns Parsed questions array
 */
function parseResponse(raw: string): GeneratedQuestion[] {
  /** Cleaned JSON string */
  let cleaned = raw.trim();

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  }
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  /** Parsed response */
  const parsed = JSON.parse(cleaned) as GeminiResponse;
  return parsed.questions ?? [];
}

/**
 * Generate questions for a single concept at a single difficulty level.
 *
 * @param concept - Target concept
 * @param difficulty - Difficulty level
 * @param count - Number of questions
 * @returns Number of questions saved to DB
 */
async function generateForDifficulty(
  concept: FlatConcept,
  difficulty: Difficulty,
  count: number,
): Promise<number> {
  /** Prompt for Gemini */
  const prompt = buildPrompt(concept, difficulty, count);

  /** Raw response from Gemini */
  const raw = await callGemini(prompt);

  /** Parsed questions */
  const questions = parseResponse(raw);

  /** Database insert params */
  const params: InsertQuestionParams[] = questions.map((q) => ({
    concept_id: concept.id,
    school_level: concept.schoolLevel,
    domain: concept.domain,
    grade: concept.grade,
    curriculum_topic: concept.curriculum.join(", "),
    difficulty,
    type: q.type,
    question: q.question,
    choices: q.choices ? JSON.stringify(q.choices) : null,
    answer: q.answer,
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
 * Generate questions for a single concept across all difficulties.
 *
 * @param concept - Target concept
 * @param countPerDifficulty - Questions per difficulty level
 * @returns Total number of questions generated
 */
export async function generateForConcept(
  concept: FlatConcept,
  countPerDifficulty: number,
): Promise<number> {
  /** Total generated count */
  let total = 0;

  for (const difficulty of DIFFICULTIES) {
    try {
      const count = await generateForDifficulty(concept, difficulty, countPerDifficulty);
      total += count;
    } catch (err) {
      console.error(
        `Failed to generate ${difficulty} questions for ${concept.id}: ${err}`,
      );
    }
  }

  return total;
}

/**
 * Generate questions for multiple concepts with progress tracking.
 *
 * @param concepts - Array of concepts to process
 * @param countPerDifficulty - Questions per difficulty level per concept
 * @param onProgress - Progress callback
 * @returns Total number of questions generated
 */
export async function generateBatch(
  concepts: FlatConcept[],
  countPerDifficulty: number,
  onProgress?: ProgressCallback,
): Promise<number> {
  /** Total questions generated */
  let totalGenerated = 0;

  for (let i = 0; i < concepts.length; i++) {
    /** Current concept */
    const concept = concepts[i];

    /** Progress label */
    const label = `[${concept.id}] ${concept.schoolLevel} ${concept.grade} - ${concept.curriculum.join(", ")}`;

    onProgress?.(i, concepts.length, label, totalGenerated);

    /** Questions generated for this concept */
    const count = await generateForConcept(concept, countPerDifficulty);
    totalGenerated += count;
  }

  onProgress?.(concepts.length, concepts.length, "완료", totalGenerated);
  return totalGenerated;
}
