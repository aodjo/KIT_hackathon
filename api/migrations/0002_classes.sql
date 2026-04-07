-- Classes (teacher creates)
CREATE TABLE IF NOT EXISTS classes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  code       TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Student-class membership
CREATE TABLE IF NOT EXISTS class_members (
  class_id   INTEGER NOT NULL REFERENCES classes(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  joined_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, student_id)
);

-- Assignments (teacher assigns to class)
CREATE TABLE IF NOT EXISTS assignments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id    INTEGER NOT NULL REFERENCES classes(id),
  teacher_id  INTEGER NOT NULL REFERENCES users(id),
  concept_id  TEXT    REFERENCES concepts(id),
  title       TEXT    NOT NULL,
  problem     TEXT    NOT NULL,
  answer      TEXT    NOT NULL,
  due_date    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Student submissions
CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  student_id    INTEGER NOT NULL REFERENCES users(id),
  answer        TEXT    NOT NULL,
  correct       INTEGER NOT NULL DEFAULT 0,
  submitted_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_members_student ON class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
