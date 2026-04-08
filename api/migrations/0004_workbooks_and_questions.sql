-- Questions marketplace
CREATE TABLE IF NOT EXISTS questions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id       TEXT NOT NULL,
  school_level     TEXT NOT NULL,
  domain           TEXT NOT NULL,
  grade            TEXT NOT NULL,
  curriculum_topic TEXT NOT NULL,
  difficulty       TEXT NOT NULL CHECK(difficulty IN ('상', '중', '하')),
  type             TEXT NOT NULL CHECK(type IN ('객관식', '주관식')),
  question         TEXT NOT NULL,
  choices          TEXT,
  answer           TEXT NOT NULL,
  explanation      TEXT NOT NULL,
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(school_level, grade, curriculum_topic);

-- Teacher workbooks
CREATE TABLE IF NOT EXISTS workbooks (
  id         TEXT PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workbooks_teacher ON workbooks(teacher_id);

-- Workbook-question junction (ordered)
CREATE TABLE IF NOT EXISTS workbook_questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  workbook_id TEXT    NOT NULL REFERENCES workbooks(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  position    INTEGER NOT NULL,
  UNIQUE(workbook_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_wq_workbook ON workbook_questions(workbook_id);
