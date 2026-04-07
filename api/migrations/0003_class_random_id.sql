-- Migrate classes.id from INTEGER AUTOINCREMENT to TEXT (random ID)

-- 1. Recreate classes with TEXT id
DROP INDEX IF EXISTS idx_classes_teacher;
DROP INDEX IF EXISTS idx_class_members_student;
DROP INDEX IF EXISTS idx_assignments_class;

ALTER TABLE class_members RENAME TO class_members_old;
ALTER TABLE assignments RENAME TO assignments_old;
ALTER TABLE classes RENAME TO classes_old;

CREATE TABLE classes (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  code       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO classes (id, name, teacher_id, code, created_at)
SELECT CAST(id AS TEXT), name, teacher_id, code, created_at FROM classes_old;

-- 2. Recreate class_members with TEXT class_id
CREATE TABLE class_members (
  class_id   TEXT    NOT NULL REFERENCES classes(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  joined_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (class_id, student_id)
);

INSERT INTO class_members (class_id, student_id, joined_at)
SELECT CAST(class_id AS TEXT), student_id, joined_at FROM class_members_old;

-- 3. Recreate assignments with TEXT class_id
CREATE TABLE assignments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id    TEXT    NOT NULL REFERENCES classes(id),
  teacher_id  INTEGER NOT NULL REFERENCES users(id),
  concept_id  TEXT    REFERENCES concepts(id),
  title       TEXT    NOT NULL,
  problem     TEXT    NOT NULL,
  answer      TEXT    NOT NULL,
  due_date    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO assignments (id, class_id, teacher_id, concept_id, title, problem, answer, due_date, created_at)
SELECT id, CAST(class_id AS TEXT), teacher_id, concept_id, title, problem, answer, due_date, created_at FROM assignments_old;

-- 4. Drop old tables
DROP TABLE class_members_old;
DROP TABLE assignments_old;
DROP TABLE classes_old;

-- 5. Recreate indexes
CREATE INDEX idx_classes_teacher ON classes(teacher_id);
CREATE INDEX idx_class_members_student ON class_members(student_id);
CREATE INDEX idx_assignments_class ON assignments(class_id);
