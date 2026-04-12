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

type CurriculumRelation = {
  sourceId: string;
  targetId: string;
  kind: 'requirement';
};

type CurriculumSnapshot = {
  concept: CurriculumConcept | null;
  lineage: CurriculumConcept[];
  relatedConcepts: CurriculumConcept[];
  relations: CurriculumRelation[];
  labels: string[];
};

type CurriculumGraph = {
  concept: CurriculumConcept | null;
  concepts: CurriculumConcept[];
  relations: CurriculumRelation[];
};

type QuestionCurriculumSnapshot = CurriculumSnapshot & {
  question: {
    id: number;
    concept_id: string;
    school_level: string;
    grade: string;
    curriculum_topic: string;
  };
};

type QuestionCurriculumGraph = CurriculumGraph & {
  question: {
    id: number;
    concept_id: string;
    school_level: string;
    grade: string;
    curriculum_topic: string;
  };
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
 * Fetch curriculum snapshot for a concept.
 *
 * @param conceptId target concept ID
 * @return concept curriculum snapshot
 */
async function fetchConceptCurriculum(conceptId: string): Promise<CurriculumSnapshot> {
  const res = await fetch(`${API}/api/curriculum/concepts/${conceptId}`);
  if (!res.ok) throw new Error(`Failed to load curriculum for concept ${conceptId}`);
  return res.json() as Promise<CurriculumSnapshot>;
}

/**
 * Fetch the full curriculum graph with an optional focused concept.
 *
 * @param conceptId optional focus concept ID
 * @return full curriculum graph
 */
async function fetchCurriculumGraph(conceptId?: string): Promise<CurriculumGraph> {
  const query = conceptId ? `?conceptId=${encodeURIComponent(conceptId)}` : '';
  const res = await fetch(`${API}/api/curriculum/graph${query}`);
  if (!res.ok) throw new Error(`Failed to load curriculum graph${conceptId ? ` for concept ${conceptId}` : ''}`);
  return res.json() as Promise<CurriculumGraph>;
}

/**
 * Fetch the full curriculum graph focused on a question's concept.
 *
 * @param questionId target question ID
 * @return question-focused full graph
 */
async function fetchQuestionCurriculumGraph(questionId: number): Promise<QuestionCurriculumGraph> {
  const res = await fetch(`${API}/api/curriculum/graph/questions/${questionId}`);
  if (!res.ok) throw new Error(`Failed to load curriculum graph for question ${questionId}`);
  return res.json() as Promise<QuestionCurriculumGraph>;
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

export type {
  CurriculumConcept,
  CurriculumGraph,
  CurriculumRelation,
  CurriculumSnapshot,
  QuestionCurriculumGraph,
  QuestionCurriculumSnapshot,
};
export {
  fetchConceptCurriculum,
  fetchCurriculumGraph,
  fetchQuestionCurriculum,
  fetchQuestionCurriculumGraph,
  fetchQuestionCurriculumMap,
};
