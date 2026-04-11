import { Hono } from 'hono';
import type { Env } from '../db/types';
import { getQuestionResolutionLock } from '../lib/questionLock';

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
 * POST /api/assignments/from-workbook
 * Create assignment from a workbook.
 * Body: { classId, teacherId, workbookId, title?, dueDate? }
 */
assignments.post('/from-workbook', async (c) => {
  const body = await c.req.json<{
    classId: string;
    teacherId: number;
    workbookId: string;
    title?: string;
    dueDate?: string;
  }>();

  /** Fetch workbook name as fallback title */
  const wb = await c.env.DB.prepare('SELECT name FROM workbooks WHERE id = ?')
    .bind(body.workbookId)
    .first<{ name: string }>();

  if (!wb) return c.json({ error: 'Workbook not found' }, 404);

  const title = body.title?.trim() || wb.name;

  const result = await c.env.DB.prepare(
    `INSERT INTO assignments (class_id, teacher_id, title, problem, answer, workbook_id, due_date)
     VALUES (?, ?, ?, '', '', ?, ?)`,
  )
    .bind(body.classId, body.teacherId, title, body.workbookId, body.dueDate ?? null)
    .run();

  return c.json({ id: result.meta.last_row_id, title });
});

/**
 * GET /api/assignments/:id/questions
 * Get questions for a workbook-based assignment.
 */
assignments.get('/:id/questions', async (c) => {
  const id = c.req.param('id');

  const assignment = await c.env.DB.prepare(
    'SELECT workbook_id FROM assignments WHERE id = ?',
  )
    .bind(id)
    .first<{ workbook_id: string | null }>();

  if (!assignment?.workbook_id) return c.json({ questions: [] });

  const questions = await c.env.DB.prepare(
    `SELECT q.*, wq.position
     FROM workbook_questions wq
     JOIN questions q ON wq.question_id = q.id
     WHERE wq.workbook_id = ?
     ORDER BY wq.position`,
  )
    .bind(assignment.workbook_id)
    .all();

  return c.json({ questions: questions.results });
});

/**
 * POST /api/assignments/:id/submit-answers
 * Student submits answers for a workbook-based assignment.
 * Body: { studentId, answers: { questionId: number, answer: string }[] }
 */
assignments.post('/:id/submit-answers', async (c) => {
  const id = c.req.param('id');
  const { studentId, answers } = await c.req.json<{
    studentId: number;
    answers: { questionId: number; answer: string }[];
  }>();

  /** Fetch correct answers for all questions */
  const assignment = await c.env.DB.prepare(
    'SELECT workbook_id FROM assignments WHERE id = ?',
  )
    .bind(id)
    .first<{ workbook_id: string | null }>();

  if (!assignment?.workbook_id) return c.json({ error: 'Not a workbook assignment' }, 400);

  const qRows = await c.env.DB.prepare(
    `SELECT q.id, q.answer FROM workbook_questions wq
     JOIN questions q ON wq.question_id = q.id
     WHERE wq.workbook_id = ?`,
  )
    .bind(assignment.workbook_id)
    .all<{ id: number; answer: string }>();

  const answerMap = new Map(qRows.results.map((r) => [r.id, r.answer]));
  const lockedConflicts: number[] = [];

  for (const answer of answers) {
    const existingLock = await getQuestionResolutionLock(c.env.DB, studentId, id, answer.questionId);
    if (!existingLock) continue;

    const lockedAnswer = existingLock.studentAnswer?.trim();
    if (lockedAnswer == null || answer.answer.trim() !== lockedAnswer) {
      lockedConflicts.push(answer.questionId);
    }
  }

  if (lockedConflicts.length > 0) {
    return c.json({
      error: 'Locked question answers cannot be changed after resolution.',
      questionIds: lockedConflicts,
    }, 409);
  }

  /** Upsert each answer */
  const stmts = answers.map((a) => {
    const correctAnswer = answerMap.get(a.questionId) ?? '';
    const correct = a.answer.trim() === correctAnswer.trim() ? 1 : 0;
    return c.env.DB.prepare(
      `INSERT INTO assignment_answers (assignment_id, student_id, question_id, answer, correct)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(assignment_id, student_id, question_id) DO UPDATE SET
         answer = excluded.answer, correct = excluded.correct, submitted_at = datetime('now')`,
    ).bind(id, studentId, a.questionId, a.answer, correct);
  });

  await c.env.DB.batch(stmts);

  /** Also upsert into submissions for aggregate tracking */
  const totalCorrect = answers.filter((a) => {
    const ca = answerMap.get(a.questionId) ?? '';
    return a.answer.trim() === ca.trim();
  }).length;

  await c.env.DB.prepare(
    `INSERT INTO submissions (assignment_id, student_id, answer, correct)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(assignment_id, student_id) DO UPDATE SET
       answer = excluded.answer, correct = excluded.correct, submitted_at = datetime('now')`,
  )
    .bind(id, studentId, `${totalCorrect}/${answers.length}`, totalCorrect === answers.length ? 1 : 0)
    .run();

  return c.json({ correct: totalCorrect, total: answers.length });
});

/**
 * POST /api/assignments/:id/signals
 * Store behavior signals for a student's assignment attempt.
 * Body: { studentId, signals: { questionId, hesitations, deleteCount, answerChanges }[] }
 */
assignments.post('/:id/signals', async (c) => {
  const assignmentId = c.req.param('id');
  const { studentId, signals } = await c.req.json<{
    studentId: number;
    signals: {
      questionId: number;
      hesitations: { timestamp: number; duration: number; after: 'typing' | 'drawing' | 'idle' }[];
      deleteCount: number;
      answerChanges: number;
    }[];
  }>();

  const stmts = signals.map((s) =>
    c.env.DB.prepare(
      `INSERT INTO behavior_signals (student_id, type, payload)
       VALUES (?, 'assignment_behavior', ?)`,
    ).bind(
      studentId,
      JSON.stringify({
        assignment_id: assignmentId,
        question_id: s.questionId,
        hesitations: s.hesitations,
        delete_count: s.deleteCount,
        answer_changes: s.answerChanges,
      }),
    ),
  );

  if (stmts.length > 0) await c.env.DB.batch(stmts);

  return c.json({ ok: true });
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
