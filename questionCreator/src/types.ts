/** Single concept entry from the curriculum data */
export interface ConceptEntry {
  /** Unique concept identifier (e.g. "N01", "C06") */
  id: string;
  /** Prerequisite concept IDs */
  requirements: string[];
  /** List of curriculum topics */
  curriculum: string[];
}

/** Grade-level mapping: grade name -> concept entries */
export type GradeMap = Record<string, ConceptEntry[]>;

/** Domain-level mapping: domain name -> grade map */
export type DomainMap = Record<string, GradeMap>;

/** Top-level curriculum data: school level -> domain map */
export type CurriculumData = Record<string, DomainMap>;

/** Flattened concept with full context */
export interface FlatConcept {
  /** Concept ID */
  id: string;
  /** School level (초등학교, 중학교, 고등학교) */
  schoolLevel: string;
  /** Domain name (수와 연산, 변화와 관계, etc.) */
  domain: string;
  /** Grade name */
  grade: string;
  /** Prerequisite concept IDs */
  requirements: string[];
  /** Curriculum topics */
  curriculum: string[];
}

/** Difficulty levels */
export type Difficulty = "상" | "중" | "하";

/** Question type */
export type QuestionType = "객관식" | "주관식";

/** Generated question from Gemini */
export interface GeneratedQuestion {
  /** Question type */
  type: QuestionType;
  /** Question text */
  question: string;
  /** Choices for multiple choice (null for short answer) */
  choices: string[] | null;
  /** Correct answer */
  answer: string;
  /** Step-by-step explanation */
  explanation: string;
}

/** Gemini API response shape */
export interface GeminiResponse {
  /** Array of generated questions */
  questions: GeneratedQuestion[];
}

/** Database question row */
export interface QuestionRow {
  /** Auto-increment ID */
  id: number;
  /** Concept ID */
  concept_id: string;
  /** School level */
  school_level: string;
  /** Domain */
  domain: string;
  /** Grade */
  grade: string;
  /** Curriculum topic */
  curriculum_topic: string;
  /** Difficulty */
  difficulty: Difficulty;
  /** Question type */
  type: QuestionType;
  /** Question text */
  question: string;
  /** JSON stringified choices (null for 주관식) */
  choices: string | null;
  /** Answer */
  answer: string;
  /** Explanation */
  explanation: string;
  /** ISO date string */
  created_at: string;
}

/** Generation progress state */
export interface GenerationProgress {
  /** Current item index */
  current: number;
  /** Total items to process */
  total: number;
  /** Currently processing concept description */
  currentLabel: string;
  /** Number of questions generated so far */
  questionsGenerated: number;
}

/** App screen state */
export type Screen =
  | "menu"
  | "bulk"
  | "select"
  | "exit";
