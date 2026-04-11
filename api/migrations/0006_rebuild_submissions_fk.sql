-- Repair submissions foreign key after assignments table rebuild in 0003.
-- Without this, submissions may still reference assignments_old(id).

PRAGMA defer_foreign_keys = on;

DROP INDEX IF EXISTS idx_submissions_assignment;
DROP INDEX IF EXISTS idx_submissions_student;

ALTER TABLE submissions RENAME TO submissions_old;

CREATE TABLE submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  student_id    INTEGER NOT NULL REFERENCES users(id),
  answer        TEXT    NOT NULL,
  correct       INTEGER NOT NULL DEFAULT 0,
  submitted_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assignment_id, student_id)
);

INSERT INTO submissions (id, assignment_id, student_id, answer, correct, submitted_at)
SELECT id, assignment_id, student_id, answer, correct, submitted_at
FROM submissions_old;

DROP TABLE submissions_old;

CREATE INDEX idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX idx_submissions_student ON submissions(student_id);
