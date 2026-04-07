import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { CurriculumData, FlatConcept } from "../types.js";

/** Resolved path to data.json */
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the curriculum data file */
const DATA_PATH = resolve(__dirname, "../../data.json");

/**
 * Load and parse the curriculum data from data.json.
 *
 * @returns Parsed curriculum data
 */
export function loadCurriculumData(): CurriculumData {
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as CurriculumData;
}

/**
 * Flatten the nested curriculum data into a flat array of concepts.
 *
 * @param data - Nested curriculum data
 * @returns Flat array of concepts with full context
 */
export function flattenConcepts(data: CurriculumData): FlatConcept[] {
  /** Accumulated flat concepts */
  const result: FlatConcept[] = [];

  for (const [schoolLevel, domains] of Object.entries(data)) {
    for (const [domain, grades] of Object.entries(domains)) {
      for (const [grade, concepts] of Object.entries(grades)) {
        for (const concept of concepts) {
          result.push({
            id: concept.id,
            schoolLevel,
            domain,
            grade,
            requirements: concept.requirements,
            curriculum: concept.curriculum,
          });
        }
      }
    }
  }

  return result;
}

/**
 * Get unique school levels from curriculum data.
 *
 * @param data - Curriculum data
 * @returns Array of school level names
 */
export function getSchoolLevels(data: CurriculumData): string[] {
  return Object.keys(data);
}

/**
 * Get all unique grades/courses for a school level (across all domains).
 *
 * @param data - Curriculum data
 * @param schoolLevel - School level name
 * @returns Array of grade names that have at least one concept
 */
export function getGrades(data: CurriculumData, schoolLevel: string): string[] {
  /** All domains for this school level */
  const domains = data[schoolLevel] ?? {};
  /** Set to track unique grade names with content */
  const gradeSet = new Set<string>();
  /** Ordered list preserving first-seen order */
  const ordered: string[] = [];

  for (const gradeMap of Object.values(domains)) {
    for (const [grade, concepts] of Object.entries(gradeMap)) {
      if (concepts.length > 0 && !gradeSet.has(grade)) {
        gradeSet.add(grade);
        ordered.push(grade);
      }
    }
  }

  return ordered;
}

/**
 * Get all concepts for a school level and grade across all domains.
 *
 * @param data - Curriculum data
 * @param schoolLevel - School level name
 * @param grade - Grade name
 * @returns Flat concepts from every domain for that grade
 */
export function getConceptsByGrade(
  data: CurriculumData,
  schoolLevel: string,
  grade: string,
): FlatConcept[] {
  /** All domains for this school level */
  const domains = data[schoolLevel] ?? {};
  /** Accumulated concepts */
  const result: FlatConcept[] = [];

  for (const [domain, gradeMap] of Object.entries(domains)) {
    for (const entry of gradeMap[grade] ?? []) {
      result.push({
        id: entry.id,
        schoolLevel,
        domain,
        grade,
        requirements: entry.requirements,
        curriculum: entry.curriculum,
      });
    }
  }

  return result;
}
