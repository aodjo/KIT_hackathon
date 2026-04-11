import { Hono } from 'hono';
import type { Env } from '../db/types';
import { getQuestionResolutionLock } from '../lib/questionLock';

/** Assignments router */
const assignments = new Hono<{ Bindings: Env }>();

type AssignmentProgressPayload = {
  version?: number;
  currentIdx?: number;
  phase?: 'answering' | 'wrong' | 'mirror';
  answers?: Record<string, string>;
  workText?: Record<string, string>;
  workDraw?: Record<string, unknown>;
  attempts?: Record<string, number>;
  results?: Record<string, boolean>;
  chatMessages?: Record<string, { role: 'ai' | 'student'; content: string }[]>;
  advanceApproved?: Record<string, boolean>;
  teacherHelpRequested?: Record<string, boolean>;
  finalResult?: { correct: number; total: number } | null;
  hesitationCounts?: Record<string, number>;
  signals?: Record<string, unknown>;
};

type StoredAssignmentProgressRecord = {
  assignmentId: string | null;
  updatedAt: string | null;
  progress: AssignmentProgressPayload | null;
};

/**
 * Parse a stored assignment-progress payload.
 *
 * @param payloadText serialized payload
 * @return normalized record or null
 */
const parseStoredAssignmentProgress = (payloadText: string): StoredAssignmentProgressRecord | null => {
  try {
    const payload = JSON.parse(payloadText) as Record<string, unknown>;
    return {
      assignmentId: payload.assignment_id == null ? null : String(payload.assignment_id),
      updatedAt: typeof payload.updated_at === 'string' ? payload.updated_at : null,
      progress: payload.progress && typeof payload.progress === 'object'
        ? payload.progress as AssignmentProgressPayload
        : null,
    };
  } catch {
    return null;
  }
};

/**
 * Count how many questions have actually been submitted in-progress.
 *
 * Draft typing does not count; only question-level submit outcomes do.
 *
 * @param progress progress payload
 * @return submitted-question count
 */
const countSubmittedQuestions = (progress: AssignmentProgressPayload | null | undefined) => {
  if (!progress) return 0;

  const ids = new Set<string>();
  const addMeaningfulKeys = (record: Record<string, unknown> | undefined) => {
    if (!record) return;
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'boolean' && !value) continue;
      if (typeof value === 'number' && value <= 0) continue;
      if (typeof value === 'string' && value.trim().length === 0) continue;
      if (value == null) continue;
      ids.add(key);
    }
  };

  addMeaningfulKeys(progress.attempts as Record<string, unknown> | undefined);
  addMeaningfulKeys(progress.results as Record<string, unknown> | undefined);
  addMeaningfulKeys(progress.advanceApproved as Record<string, unknown> | undefined);
  addMeaningfulKeys(progress.teacherHelpRequested as Record<string, unknown> | undefined);

  return ids.size;
};

/**
 * Format the partial-submission label shown in teacher and student lists.
 *
 * @param submittedCount number of submitted questions
 * @param totalQuestions optional total question count
 * @return summary label
 */
const formatProgressSubmissionLabel = (submittedCount: number, totalQuestions: number | null) => (
  totalQuestions && totalQuestions > 0
    ? `${submittedCount}/${totalQuestions} 진행 중`
    : `${submittedCount}문제 진행 중`
);

type AssignmentQuestionSnapshot = {
  id: number;
  concept_id: string;
  school_level: string;
  grade: string;
  curriculum_topic: string;
  difficulty: string;
  type: string;
  question: string;
  choices: string | null;
  answer: string;
  explanation: string;
};

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
 * POST /api/assignments/:id/progress
 * Persist in-progress student solve state for refresh/reconnect recovery.
 * Body: { studentId, progress }
 */
assignments.post('/:id/progress', async (c) => {
  const assignmentId = c.req.param('id');
  const { studentId, progress } = await c.req.json<{
    studentId: number;
    progress: AssignmentProgressPayload;
  }>();

  await c.env.DB.prepare(
    `DELETE FROM behavior_signals
     WHERE student_id = ?
       AND type = 'assignment_progress'
       AND json_extract(payload, '$.assignment_id') = ?`,
  )
    .bind(studentId, assignmentId)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO behavior_signals (student_id, type, payload)
     VALUES (?, 'assignment_progress', ?)`,
  )
    .bind(
      studentId,
      JSON.stringify({
        assignment_id: assignmentId,
        updated_at: new Date().toISOString(),
        progress,
      }),
    )
    .run();

  return c.json({ ok: true });
});

/**
 * GET /api/assignments/:id/progress/:studentId
 * Restore the latest in-progress student solve state.
 */
assignments.get('/:id/progress/:studentId', async (c) => {
  const assignmentId = c.req.param('id');
  const studentId = Number(c.req.param('studentId'));

  const row = await c.env.DB.prepare(
    `SELECT payload
     FROM behavior_signals
     WHERE student_id = ?
       AND type = 'assignment_progress'
       AND json_extract(payload, '$.assignment_id') = ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(studentId, assignmentId)
    .first<{ payload: string }>();

  if (!row?.payload) return c.json({ progress: null });

  try {
    const payload = JSON.parse(row.payload) as { progress?: AssignmentProgressPayload };
    return c.json({ progress: payload.progress ?? null });
  } catch {
    return c.json({ progress: null });
  }
});

/**
 * GET /api/assignments/:id/student-view/:studentId
 * Get a teacher-facing readonly snapshot of a student's assignment state.
 */
assignments.get('/:id/student-view/:studentId', async (c) => {
  const assignmentId = c.req.param('id');
  const studentId = Number(c.req.param('studentId'));

  const assignment = await c.env.DB.prepare(
    'SELECT * FROM assignments WHERE id = ?',
  )
    .bind(assignmentId)
    .first<Record<string, unknown>>();

  if (!assignment) return c.json({ error: 'Assignment not found' }, 404);

  const student = await c.env.DB.prepare(
    'SELECT id, name, user_id FROM users WHERE id = ?',
  )
    .bind(studentId)
    .first<{ id: number; name: string; user_id: string }>();

  if (!student) return c.json({ error: 'Student not found' }, 404);

  let questions: AssignmentQuestionSnapshot[] = [];
  if (assignment.workbook_id) {
    const questionRows = await c.env.DB.prepare(
      `SELECT q.*
       FROM workbook_questions wq
       JOIN questions q ON wq.question_id = q.id
       WHERE wq.workbook_id = ?
       ORDER BY wq.position`,
    )
      .bind(assignment.workbook_id)
      .all<AssignmentQuestionSnapshot>();
    questions = questionRows.results;
  } else {
    questions = [{
      id: Number(assignment.id),
      concept_id: assignment.concept_id == null ? '' : String(assignment.concept_id),
      school_level: '',
      grade: '',
      curriculum_topic: '',
      difficulty: '',
      type: '주관식',
      question: String(assignment.problem ?? ''),
      choices: null,
      answer: String(assignment.answer ?? ''),
      explanation: '',
    }];
  }

  const progressRow = await c.env.DB.prepare(
    `SELECT payload, created_at
     FROM behavior_signals
     WHERE student_id = ?
       AND type = 'assignment_progress'
       AND json_extract(payload, '$.assignment_id') = ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(studentId, assignmentId)
    .first<{ payload: string; created_at: string }>();

  const parsedProgress = progressRow?.payload ? parseStoredAssignmentProgress(progressRow.payload) : null;
  const progress = parsedProgress?.progress ?? null;

  const answerRows = await c.env.DB.prepare(
    `SELECT question_id, answer, correct, submitted_at
     FROM assignment_answers
     WHERE assignment_id = ?
       AND student_id = ?`,
  )
    .bind(assignmentId, studentId)
    .all<{ question_id: number; answer: string; correct: number; submitted_at: string }>();

  const submission = await c.env.DB.prepare(
    `SELECT answer, correct, submitted_at
     FROM submissions
     WHERE assignment_id = ?
       AND student_id = ?
     LIMIT 1`,
  )
    .bind(assignmentId, studentId)
    .first<{ answer: string; correct: number; submitted_at: string }>();

  const resolutionRows = await c.env.DB.prepare(
    `SELECT payload
     FROM behavior_signals
     WHERE student_id = ?
       AND type = 'mirror_resolution'
       AND json_extract(payload, '$.assignment_id') = ?
     ORDER BY created_at DESC`,
  )
    .bind(studentId, assignmentId)
    .all<{ payload: string }>();

  const transcriptRows = await c.env.DB.prepare(
    `SELECT payload
     FROM behavior_signals
     WHERE student_id = ?
       AND type = 'mirror_chat'
       AND json_extract(payload, '$.assignment_id') = ?
     ORDER BY created_at DESC`,
  )
    .bind(studentId, assignmentId)
    .all<{ payload: string }>();

  const answers: Record<string, string> = { ...(progress?.answers ?? {}) };
  const workDraw: Record<string, unknown> = { ...(progress?.workDraw ?? {}) };
  const attempts: Record<string, number> = { ...(progress?.attempts ?? {}) };
  const results: Record<string, boolean> = { ...(progress?.results ?? {}) };
  const chatMessages: Record<string, { role: 'ai' | 'student'; content: string }[]> = { ...(progress?.chatMessages ?? {}) };
  const advanceApproved: Record<string, boolean> = { ...(progress?.advanceApproved ?? {}) };
  const teacherHelpRequested: Record<string, boolean> = { ...(progress?.teacherHelpRequested ?? {}) };

  answerRows.results.forEach((row) => {
    const questionKey = String(row.question_id);
    answers[questionKey] = row.answer;
    results[questionKey] = row.correct === 1;
  });

  const seenResolutionQuestions = new Set<string>();
  resolutionRows.results.forEach((row) => {
    try {
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      const questionKey = String(payload.question_id ?? '');
      if (!questionKey || seenResolutionQuestions.has(questionKey)) return;
      seenResolutionQuestions.add(questionKey);

      const status = payload.status === 'teacher_help' ? 'teacher_help' : payload.status === 'approved' ? 'approved' : null;
      if (!status) return;

      if (typeof payload.student_answer === 'string' && !(questionKey in answers)) {
        answers[questionKey] = payload.student_answer;
      }
      if (status === 'teacher_help') {
        teacherHelpRequested[questionKey] = true;
      } else {
        advanceApproved[questionKey] = true;
      }
    } catch {
      // ignore malformed rows
    }
  });

  const seenTranscriptQuestions = new Set<string>();
  transcriptRows.results.forEach((row) => {
    try {
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      const questionKey = String(payload.question_id ?? '');
      if (!questionKey || seenTranscriptQuestions.has(questionKey)) return;
      seenTranscriptQuestions.add(questionKey);

      const messages = Array.isArray(payload.messages)
        ? payload.messages
          .map((message) => ({
            role: message && typeof message === 'object' && (message as Record<string, unknown>).role === 'ai' ? 'ai' as const : 'student' as const,
            content: String(message && typeof message === 'object' ? (message as Record<string, unknown>).content ?? '' : '').trim(),
          }))
          .filter((message) => message.content.length > 0)
        : [];

      if (messages.length > 0) {
        chatMessages[questionKey] = messages;
      }
    } catch {
      // ignore malformed rows
    }
  });

  const totalQuestions = questions.length;
  const finalResult = progress?.finalResult
    ?? (submission
      ? {
        correct: answerRows.results.filter((row) => row.correct === 1).length,
        total: totalQuestions,
      }
      : null);
  const submissionStatus = submission
    ? 'submitted'
    : countSubmittedQuestions(progress) > 0 || answerRows.results.length > 0
      ? 'progress'
      : null;
  const submittedAt = submission?.submitted_at ?? parsedProgress?.updatedAt ?? progressRow?.created_at ?? null;
  const currentIdx = typeof progress?.currentIdx === 'number'
    ? Math.max(0, Math.min(progress.currentIdx, Math.max(questions.length - 1, 0)))
    : 0;

  return c.json({
    assignment: {
      id: assignment.id,
      class_id: assignment.class_id,
      title: assignment.title,
      workbook_id: assignment.workbook_id ?? null,
    },
    student,
    questions,
    snapshot: {
      currentIdx,
      answers,
      workDraw,
      attempts,
      results,
      chatMessages,
      advanceApproved,
      teacherHelpRequested,
      finalResult,
      submissionStatus,
      submittedAt,
    },
  });
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

    const lockedAnswer = existingLock.studentAnswer?.trim() ?? '';
    if (answer.answer.trim() !== lockedAnswer) {
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

  const assignmentsList = result.results as Array<Record<string, unknown>>;
  if (assignmentsList.length === 0) return c.json({ assignments: [] });

  const assignmentIds = assignmentsList.map((assignment) => String(assignment.id));
  const placeholders = assignmentIds.map(() => '?').join(', ');
  const submittedStudentsByAssignment = new Map<string, Set<number>>();
  const getStudentSet = (assignmentId: string) => {
    const existing = submittedStudentsByAssignment.get(assignmentId);
    if (existing) return existing;
    const created = new Set<number>();
    submittedStudentsByAssignment.set(assignmentId, created);
    return created;
  };

  const finalSubmissionRows = await c.env.DB.prepare(
    `SELECT assignment_id, student_id
     FROM submissions
     WHERE assignment_id IN (${placeholders})`,
  )
    .bind(...assignmentIds)
    .all<{ assignment_id: number; student_id: number }>();

  finalSubmissionRows.results.forEach((row) => {
    getStudentSet(String(row.assignment_id)).add(row.student_id);
  });

  const progressRows = await c.env.DB.prepare(
    `SELECT student_id, payload
     FROM behavior_signals
     WHERE type = 'assignment_progress'
       AND json_extract(payload, '$.assignment_id') IN (${placeholders})
     ORDER BY created_at DESC`,
  )
    .bind(...assignmentIds)
    .all<{ student_id: number; payload: string }>();

  progressRows.results.forEach((row) => {
    const parsed = parseStoredAssignmentProgress(row.payload);
    if (!parsed?.assignmentId || countSubmittedQuestions(parsed.progress) === 0) return;
    getStudentSet(parsed.assignmentId).add(row.student_id);
  });

  return c.json({
    assignments: assignmentsList.map((assignment) => ({
      ...assignment,
      submission_count: submittedStudentsByAssignment.get(String(assignment.id))?.size ?? 0,
    })),
  });
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

  let totalQuestions: number | null = null;
  if (assignment.workbook_id) {
    const questionCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM workbook_questions WHERE workbook_id = ?',
    )
      .bind(assignment.workbook_id)
      .first<{ count: number }>();
    totalQuestions = Number(questionCount?.count ?? 0);
  }

  const submissions = await c.env.DB.prepare(
    `SELECT s.*, u.name as student_name, u.user_id as student_user_id
     FROM submissions s JOIN users u ON s.student_id = u.id
     WHERE s.assignment_id = ?
     ORDER BY s.submitted_at DESC`,
  )
    .bind(id)
    .all();

  const finalSubmissions = submissions.results.map((submission: any) => ({
    ...submission,
    submission_status: 'submitted',
  }));
  const finalStudentIds = new Set(finalSubmissions.map((submission: any) => Number(submission.student_id)));

  const progressRows = await c.env.DB.prepare(
    `SELECT bs.student_id, u.name as student_name, u.user_id as student_user_id, bs.payload, bs.created_at
     FROM behavior_signals bs
     JOIN users u ON bs.student_id = u.id
     JOIN class_members cm ON cm.student_id = bs.student_id
     WHERE cm.class_id = ?
       AND bs.type = 'assignment_progress'
       AND json_extract(bs.payload, '$.assignment_id') = ?
     ORDER BY bs.created_at DESC`,
  )
    .bind(assignment.class_id, id)
    .all<{ student_id: number; student_name: string; student_user_id: string; payload: string; created_at: string }>();

  const partialSubmissions = progressRows.results
    .map((row) => {
      if (finalStudentIds.has(row.student_id)) return null;
      const parsed = parseStoredAssignmentProgress(row.payload);
      const submittedCount = countSubmittedQuestions(parsed?.progress);
      if (!parsed?.assignmentId || submittedCount === 0) return null;

      return {
        student_id: row.student_id,
        student_name: row.student_name,
        student_user_id: row.student_user_id,
        answer: formatProgressSubmissionLabel(submittedCount, totalQuestions),
        correct: 0,
        submitted_at: parsed.updatedAt ?? row.created_at,
        submission_status: 'progress',
      };
    })
    .filter((submission): submission is {
      student_id: number;
      student_name: string;
      student_user_id: string;
      answer: string;
      correct: number;
      submitted_at: string;
      submission_status: 'progress';
    } => submission != null);

  const mergedSubmissions = [...finalSubmissions, ...partialSubmissions]
    .sort((left, right) => new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime());

  return c.json({ assignment, submissions: mergedSubmissions });
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

  const assignmentsList = result.results as Array<Record<string, unknown>>;
  if (assignmentsList.length === 0) return c.json({ assignments: [] });

  const assignmentIds = assignmentsList.map((assignment) => String(assignment.id));
  const workbookIds = Array.from(new Set(
    assignmentsList
      .map((assignment) => assignment.workbook_id == null ? '' : String(assignment.workbook_id))
      .filter(Boolean),
  ));
  const workbookQuestionCounts = new Map<string, number>();

  if (workbookIds.length > 0) {
    const workbookPlaceholders = workbookIds.map(() => '?').join(', ');
    const workbookCounts = await c.env.DB.prepare(
      `SELECT workbook_id, COUNT(*) as count
       FROM workbook_questions
       WHERE workbook_id IN (${workbookPlaceholders})
       GROUP BY workbook_id`,
    )
      .bind(...workbookIds)
      .all<{ workbook_id: string; count: number }>();

    workbookCounts.results.forEach((row) => {
      workbookQuestionCounts.set(row.workbook_id, Number(row.count));
    });
  }

  const progressPlaceholders = assignmentIds.map(() => '?').join(', ');
  const progressRows = await c.env.DB.prepare(
    `SELECT payload, created_at
     FROM behavior_signals
     WHERE student_id = ?
       AND type = 'assignment_progress'
       AND json_extract(payload, '$.assignment_id') IN (${progressPlaceholders})
     ORDER BY created_at DESC`,
  )
    .bind(studentId, ...assignmentIds)
    .all<{ payload: string; created_at: string }>();

  const progressByAssignment = new Map<string, { submittedCount: number; submittedAt: string }>();
  progressRows.results.forEach((row) => {
    const parsed = parseStoredAssignmentProgress(row.payload);
    if (!parsed?.assignmentId || progressByAssignment.has(parsed.assignmentId)) return;

    const submittedCount = countSubmittedQuestions(parsed.progress);
    if (submittedCount === 0) return;

    progressByAssignment.set(parsed.assignmentId, {
      submittedCount,
      submittedAt: parsed.updatedAt ?? row.created_at,
    });
  });

  return c.json({
    assignments: assignmentsList.map((assignment) => {
      if (assignment.submitted_at) {
        return {
          ...assignment,
          submission_status: 'submitted',
        };
      }

      const assignmentId = String(assignment.id);
      const progress = progressByAssignment.get(assignmentId);
      if (!progress) {
        return {
          ...assignment,
          submission_status: null,
        };
      }

      const workbookId = assignment.workbook_id == null ? null : String(assignment.workbook_id);
      const totalQuestions = workbookId ? (workbookQuestionCounts.get(workbookId) ?? null) : null;

      return {
        ...assignment,
        my_answer: formatProgressSubmissionLabel(progress.submittedCount, totalQuestions),
        my_correct: 0,
        submitted_at: progress.submittedAt,
        submission_status: 'progress',
      };
    }),
  });
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
