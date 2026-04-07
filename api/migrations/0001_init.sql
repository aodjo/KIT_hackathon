-- Users table (Google SSO)
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  user_id    TEXT    NOT NULL UNIQUE,
  role       TEXT    NOT NULL CHECK (role IN ('teacher', 'student')),
  picture    TEXT    DEFAULT '',
  class_name TEXT    DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Knowledge graph nodes
CREATE TABLE IF NOT EXISTS concepts (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  school_level TEXT NOT NULL,
  subject      TEXT NOT NULL,
  grade        TEXT NOT NULL
);

-- Knowledge graph edges (prerequisites)
CREATE TABLE IF NOT EXISTS concept_edges (
  parent_id TEXT NOT NULL REFERENCES concepts(id),
  child_id  TEXT NOT NULL REFERENCES concepts(id),
  weight    REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (parent_id, child_id)
);

-- Student problem attempts
CREATE TABLE IF NOT EXISTS solutions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  concept_id TEXT    NOT NULL REFERENCES concepts(id),
  problem    TEXT    NOT NULL,
  answer     TEXT    NOT NULL,
  correct    INTEGER NOT NULL DEFAULT 0,
  reasoning  TEXT    DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Detected misconceptions
CREATE TABLE IF NOT EXISTS misconceptions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES users(id),
  concept_id    TEXT    NOT NULL REFERENCES concepts(id),
  root_cause_id TEXT    REFERENCES concepts(id),
  description   TEXT    NOT NULL,
  confidence    REAL    NOT NULL DEFAULT 0.0,
  resolved      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Reverse-learning chat sessions
CREATE TABLE IF NOT EXISTS mirror_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES users(id),
  concept_id    TEXT    NOT NULL REFERENCES concepts(id),
  understanding INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Chat messages per session
CREATE TABLE IF NOT EXISTS mirror_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES mirror_sessions(id),
  role       TEXT    NOT NULL CHECK (role IN ('ai', 'student')),
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Behavior signals (scroll, dwell, delete)
CREATE TABLE IF NOT EXISTS behavior_signals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  session_id INTEGER REFERENCES mirror_sessions(id),
  type       TEXT    NOT NULL,
  payload    TEXT    NOT NULL DEFAULT '{}',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_solutions_student ON solutions(student_id);
CREATE INDEX IF NOT EXISTS idx_misconceptions_student ON misconceptions(student_id);
CREATE INDEX IF NOT EXISTS idx_mirror_sessions_student ON mirror_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_mirror_messages_session ON mirror_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_behavior_signals_student ON behavior_signals(student_id);
