import Database from "better-sqlite3";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { Difficulty, QuestionType, QuestionRow } from "../types.js";

/** Resolved directory of this file */
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the SQLite database file */
const DB_PATH = resolve(__dirname, "../../questions.db");

/** Singleton database instance */
let db: Database.Database | null = null;

/**
 * Get or create the database connection singleton.
 *
 * @returns SQLite database instance
 */
export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

/**
 * Initialize the database schema.
 *
 * @param database - Database instance
 */
function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concept_id TEXT NOT NULL,
      school_level TEXT NOT NULL,
      domain TEXT NOT NULL,
      grade TEXT NOT NULL,
      curriculum_topic TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK(difficulty IN ('상', '중', '하')),
      type TEXT NOT NULL CHECK(type IN ('객관식', '주관식')),
      question TEXT NOT NULL,
      choices TEXT,
      answer TEXT NOT NULL,
      explanation TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_questions_concept
      ON questions(concept_id);
    CREATE INDEX IF NOT EXISTS idx_questions_difficulty
      ON questions(difficulty);
    CREATE INDEX IF NOT EXISTS idx_questions_type
      ON questions(type);
  `);
}

/** Parameters for inserting a question */
export interface InsertQuestionParams {
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
  /** Difficulty level */
  difficulty: Difficulty;
  /** Question type */
  type: QuestionType;
  /** Question text */
  question: string;
  /** JSON stringified choices or null */
  choices: string | null;
  /** Correct answer */
  answer: string;
  /** Explanation */
  explanation: string;
}

/**
 * Insert a single question into the database.
 *
 * @param params - Question data to insert
 * @returns Inserted row ID
 */
export function insertQuestion(params: InsertQuestionParams): number {
  /** Database instance */
  const database = getDb();

  /** Insert statement */
  const stmt = database.prepare(`
    INSERT INTO questions
      (concept_id, school_level, domain, grade, curriculum_topic,
       difficulty, type, question, choices, answer, explanation)
    VALUES
      (@concept_id, @school_level, @domain, @grade, @curriculum_topic,
       @difficulty, @type, @question, @choices, @answer, @explanation)
  `);

  /** Execution result */
  const result = stmt.run(params);
  return Number(result.lastInsertRowid);
}

/**
 * Insert multiple questions in a transaction.
 *
 * @param questions - Array of question params
 * @returns Number of inserted rows
 */
export function insertQuestions(questions: InsertQuestionParams[]): number {
  /** Database instance */
  const database = getDb();

  /** Insert statement */
  const stmt = database.prepare(`
    INSERT INTO questions
      (concept_id, school_level, domain, grade, curriculum_topic,
       difficulty, type, question, choices, answer, explanation)
    VALUES
      (@concept_id, @school_level, @domain, @grade, @curriculum_topic,
       @difficulty, @type, @question, @choices, @answer, @explanation)
  `);

  /** Transaction wrapper */
  const insertMany = database.transaction((items: InsertQuestionParams[]) => {
    for (const item of items) {
      stmt.run(item);
    }
    return items.length;
  });

  return insertMany(questions);
}

/**
 * Get total question count in the database.
 *
 * @returns Total number of questions
 */
export function getQuestionCount(): number {
  /** Database instance */
  const database = getDb();

  /** Count result */
  const row = database.prepare("SELECT COUNT(*) as count FROM questions").get() as { count: number };
  return row.count;
}

/**
 * Get question count grouped by concept_id.
 *
 * @returns Array of concept ID and count pairs
 */
export function getCountByConcept(): { concept_id: string; count: number }[] {
  /** Database instance */
  const database = getDb();

  return database
    .prepare("SELECT concept_id, COUNT(*) as count FROM questions GROUP BY concept_id")
    .all() as { concept_id: string; count: number }[];
}

/**
 * Close the database connection.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
