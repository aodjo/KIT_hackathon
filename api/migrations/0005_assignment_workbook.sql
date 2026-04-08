-- Add workbook_id to assignments for workbook-based assignments
ALTER TABLE assignments ADD COLUMN workbook_id TEXT REFERENCES workbooks(id);

-- Per-question submissions for workbook assignments
CREATE TABLE IF NOT EXISTS assignment_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  answer TEXT NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assignment_id, student_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_answers_assignment ON assignment_answers(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_answers_student ON assignment_answers(student_id);
