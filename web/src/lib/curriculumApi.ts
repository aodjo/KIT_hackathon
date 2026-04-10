/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

type CurriculumConcept = {
  id: string;
  schoolLevel: string;
  subject: string;
  grade: string;
  requirements: string[];
  curriculum: string[];
};

type QuestionCurriculumSnapshot = {
  question: {
    id: number;
    concept_id: string;
    school_level: string;
    grade: string;
    curriculum_topic: string;
  };
  concept: CurriculumConcept | null;
  lineage: CurriculumConcept[];
  labels: string[];
};

/**
 * Fetch curriculum snapshot for a question.
 *
 * @param questionId target question ID
 * @return question curriculum snapshot
 */
async function fetchQuestionCurriculum(questionId: number): Promise<QuestionCurriculumSnapshot> {
  const res = await fetch(`${API}/api/curriculum/questions/${questionId}`);
  if (!res.ok) throw new Error(`Failed to load curriculum for question ${questionId}`);
  return res.json() as Promise<QuestionCurriculumSnapshot>;
}

/**
 * Fetch curriculum snapshots for multiple questions.
 *
 * @param questionIds target question IDs
 * @return map keyed by question ID
 */
async function fetchQuestionCurriculumMap(questionIds: number[]) {
  const uniqueIds = Array.from(new Set(questionIds)).filter((id) => Number.isFinite(id));
  const entries = await Promise.all(
    uniqueIds.map(async (questionId) => [questionId, await fetchQuestionCurriculum(questionId)] as const),
  );
  return Object.fromEntries(entries) as Record<number, QuestionCurriculumSnapshot>;
}

export type { CurriculumConcept, QuestionCurriculumSnapshot };
export { fetchQuestionCurriculum, fetchQuestionCurriculumMap };
