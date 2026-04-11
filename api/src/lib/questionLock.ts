import type { Env } from '../db/types';

export type QuestionResolutionStatus = 'approved' | 'teacher_help';

export type QuestionResolutionLock = {
  status: QuestionResolutionStatus;
  reason: string | null;
  studentAnswer: string | null;
  workText: string | null;
  teacherHelpRequested: boolean;
  lockedAt: string | null;
};

type SaveQuestionResolutionLockInput = {
  studentId: number;
  assignmentId: string;
  questionId: number;
  conceptId?: string | null;
  status: QuestionResolutionStatus;
  reason?: string | null;
  studentAnswer?: string | null;
  workText?: string | null;
};

/**
 * Fetch the latest resolution lock for a student's assignment question.
 *
 * @param db D1 database binding
 * @param studentId student identifier
 * @param assignmentId assignment identifier
 * @param questionId question identifier
 * @return latest lock metadata or null
 */
export const getQuestionResolutionLock = async (
  db: Env['DB'],
  studentId: number,
  assignmentId: string,
  questionId: number,
): Promise<QuestionResolutionLock | null> => {
  const row = await db.prepare(
    `SELECT payload
     FROM behavior_signals
     WHERE student_id = ?
       AND type = 'mirror_resolution'
       AND json_extract(payload, '$.assignment_id') = ?
       AND json_extract(payload, '$.question_id') = ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(studentId, assignmentId, questionId)
    .first<{ payload: string }>();

  if (!row?.payload) return null;

  try {
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const status = payload.status === 'teacher_help' ? 'teacher_help' : payload.status === 'approved' ? 'approved' : null;
    if (!status) return null;

    return {
      status,
      reason: typeof payload.reason === 'string' ? payload.reason : null,
      studentAnswer: typeof payload.student_answer === 'string' ? payload.student_answer : null,
      workText: typeof payload.work_text === 'string' ? payload.work_text : null,
      teacherHelpRequested: payload.teacher_help_requested === true || status === 'teacher_help',
      lockedAt: typeof payload.locked_at === 'string' ? payload.locked_at : null,
    };
  } catch {
    return null;
  }
};

/**
 * Persist the latest resolution lock for a student's assignment question.
 *
 * @param db D1 database binding
 * @param input lock payload
 * @return void
 */
export const saveQuestionResolutionLock = async (
  db: Env['DB'],
  input: SaveQuestionResolutionLockInput,
) => {
  await db.prepare(
    `DELETE FROM behavior_signals
     WHERE student_id = ?
       AND type = 'mirror_resolution'
       AND json_extract(payload, '$.assignment_id') = ?
       AND json_extract(payload, '$.question_id') = ?`,
  )
    .bind(input.studentId, input.assignmentId, input.questionId)
    .run();

  await db.prepare(
    `INSERT INTO behavior_signals (student_id, type, payload)
     VALUES (?, 'mirror_resolution', ?)`,
  )
    .bind(
      input.studentId,
      JSON.stringify({
        assignment_id: input.assignmentId,
        question_id: input.questionId,
        concept_id: input.conceptId ?? null,
        status: input.status,
        reason: input.reason?.trim() || null,
        student_answer: input.studentAnswer?.trim() || null,
        work_text: input.workText?.trim() || null,
        teacher_help_requested: input.status === 'teacher_help',
        locked_at: new Date().toISOString(),
      }),
    )
    .run();
};
