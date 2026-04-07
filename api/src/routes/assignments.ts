import { Hono } from 'hono';
import type { Env } from '../db/types';

/** Assignments router */
const assignments = new Hono<{ Bindings: Env }>();

/**
 * POST /api/assignments
 * Teacher creates an assignment for a class.
 * Body: { classId, teacherId, title, problem, answer, conceptId?, dueDate? }
 */
assignments.post('/', async (c) => {
  const body = await c.req.json<{
    classId: string;
    teacherId: number;
    title: string;
    problem: string;
    answer: string;
    conceptId?: string;
    dueDate?: string;
  }>();

  const result = await c.env.DB.prepare(
    `INSERT INTO assignments (class_id, teacher_id, concept_id, title, problem, answer, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      body.classId,
      body.teacherId,
      body.conceptId ?? null,
      body.title,
      body.problem,
      body.answer,
      body.dueDate ?? null,
    )
    .run();

  return c.json({ id: result.meta.last_row_id });
});

/**
 * GET /api/assignments/class/:classId
 * List assignments for a class.
 */
assignments.get('/class/:classId', async (c) => {
  const classId = c.req.param('classId');

  const result = await c.env.DB.prepare(
    `SELECT a.*,
       (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) as submission_count,
       (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = a.class_id) as total_students
     FROM assignments a
     WHERE a.class_id = ?
     ORDER BY a.created_at DESC`,
  )
    .bind(classId)
    .all();

  return c.json({ assignments: result.results });
});

/**
 * GET /api/assignments/:id
 * Get single assignment with submission stats.
 */
assignments.get('/:id', async (c) => {
  const id = c.req.param('id');

  const assignment = await c.env.DB.prepare(
    'SELECT * FROM assignments WHERE id = ?',
  )
    .bind(id)
    .first();

  if (!assignment) return c.json({ error: 'Assignment not found' }, 404);

  const submissions = await c.env.DB.prepare(
    `SELECT s.*, u.name as student_name, u.user_id as student_user_id
     FROM submissions s JOIN users u ON s.student_id = u.id
     WHERE s.assignment_id = ?
     ORDER BY s.submitted_at DESC`,
  )
    .bind(id)
    .all();

  return c.json({ assignment, submissions: submissions.results });
});

/**
 * GET /api/assignments/student/:studentId
 * List all assignments for a student across their classes.
 */
assignments.get('/student/:studentId', async (c) => {
  const studentId = c.req.param('studentId');

  const result = await c.env.DB.prepare(
    `SELECT a.*, c.name as class_name,
       s.answer as my_answer, s.correct as my_correct, s.submitted_at
     FROM assignments a
     JOIN class_members cm ON a.class_id = cm.class_id
     JOIN classes c ON a.class_id = c.id
     LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_id = cm.student_id
     WHERE cm.student_id = ?
     ORDER BY a.created_at DESC`,
  )
    .bind(studentId)
    .all();

  return c.json({ assignments: result.results });
});

/**
 * POST /api/assignments/:id/submit
 * Student submits an answer.
 * Body: { studentId, answer }
 */
assignments.post('/:id/submit', async (c) => {
  const id = c.req.param('id');
  const { studentId, answer } = await c.req.json<{
    studentId: number;
    answer: string;
  }>();

  /** Fetch correct answer */
  const assignment = await c.env.DB.prepare(
    'SELECT answer FROM assignments WHERE id = ?',
  )
    .bind(id)
    .first<{ answer: string }>();

  if (!assignment) return c.json({ error: 'Assignment not found' }, 404);

  /** Check correctness */
  const correct = answer.trim() === assignment.answer.trim() ? 1 : 0;

  await c.env.DB.prepare(
    `INSERT INTO submissions (assignment_id, student_id, answer, correct)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(assignment_id, student_id) DO UPDATE SET
       answer = excluded.answer,
       correct = excluded.correct,
       submitted_at = datetime('now')`,
  )
    .bind(id, studentId, answer, correct)
    .run();

  return c.json({ correct: !!correct, correctAnswer: correct ? undefined : assignment.answer });
});

export default assignments;
