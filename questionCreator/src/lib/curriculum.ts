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
 * Get domains for a given school level.
 *
 * @param data - Curriculum data
 * @param schoolLevel - School level name
 * @returns Array of domain names
 */
export function getDomains(data: CurriculumData, schoolLevel: string): string[] {
  return Object.keys(data[schoolLevel] ?? {});
}

/**
 * Get grades for a given school level and domain.
 *
 * @param data - Curriculum data
 * @param schoolLevel - School level name
 * @param domain - Domain name
 * @returns Array of grade names (filtered to non-empty)
 */
export function getGrades(
  data: CurriculumData,
  schoolLevel: string,
  domain: string,
): string[] {
  /** Grade map for the given school/domain */
  const gradeMap = data[schoolLevel]?.[domain] ?? {};
  return Object.entries(gradeMap)
    .filter(([, concepts]) => concepts.length > 0)
    .map(([grade]) => grade);
}

/**
 * Get concepts for a given school level, domain, and grade.
 *
 * @param data - Curriculum data
 * @param schoolLevel - School level name
 * @param domain - Domain name
 * @param grade - Grade name
 * @returns Array of flat concepts
 */
export function getConcepts(
  data: CurriculumData,
  schoolLevel: string,
  domain: string,
  grade: string,
): FlatConcept[] {
  /** Raw concept entries */
  const entries = data[schoolLevel]?.[domain]?.[grade] ?? [];
  return entries.map((e) => ({
    id: e.id,
    schoolLevel,
    domain,
    grade,
    requirements: e.requirements,
    curriculum: e.curriculum,
  }));
}
