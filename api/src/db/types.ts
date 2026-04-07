/** User role */
type Role = 'teacher' | 'student';

/** User record from D1 */
type User = {
  id: number;
  email: string;
  name: string;
  user_id: string;
  role: Role;
  picture: string;
  class_name: string;
  created_at: string;
  updated_at: string;
};

/** Concept node in knowledge graph */
type Concept = {
  id: string;
  name: string;
  school_level: string;
  subject: string;
  grade: string;
};

/** Mirror learning session */
type MirrorSession = {
  id: number;
  student_id: number;
  concept_id: string;
  understanding: number;
  status: 'active' | 'completed';
  created_at: string;
  updated_at: string;
};

/** Chat message in a session */
type MirrorMessage = {
  id: number;
  session_id: number;
  role: 'ai' | 'student';
  content: string;
  created_at: string;
};

/** Cloudflare Worker env bindings */
type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  ANTHROPIC_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ENVIRONMENT: string;
};

export type { Role, User, Concept, MirrorSession, MirrorMessage, Env };
