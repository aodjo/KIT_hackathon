import { Hono } from 'hono';
import type { Env } from '../db/types';

/** Workbooks router */
const workbooks = new Hono<{ Bindings: Env }>();

/**
 * Generate random alphanumeric string.
 *
 * @param len desired length
 * @return random string
 */
function randomId(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

/**
 * GET /api/workbooks/teacher/:teacherId
 * List all workbooks for a teacher.
 *
 * @return workbook list with question counts
 */
workbooks.get('/teacher/:teacherId', async (c) => {
  const teacherId = c.req.param('teacherId');

  const result = await c.env.DB.prepare(
    `SELECT w.*, COUNT(wq.question_id) as question_count
     FROM workbooks w
     LEFT JOIN workbook_questions wq ON w.id = wq.workbook_id
     WHERE w.teacher_id = ?
     GROUP BY w.id
     ORDER BY w.updated_at DESC`,
  )
    .bind(teacherId)
    .all();

  return c.json({ workbooks: result.results });
});

/**
 * POST /api/workbooks
 * Create a workbook.
 * Body: { teacherId, name }
 *
 * @return created workbook
 */
workbooks.post('/', async (c) => {
  const { teacherId, name } = await c.req.json<{
    teacherId: number;
    name: string;
  }>();

  /** Random workbook ID */
  const id = randomId(12);

  await c.env.DB.prepare(
    'INSERT INTO workbooks (id, teacher_id, name) VALUES (?, ?, ?)',
  )
    .bind(id, teacherId, name)
    .run();

  return c.json({ id, name, teacherId, question_count: 0 });
});

/**
 * GET /api/workbooks/:id
 * Get workbook with ordered questions.
 *
 * @return workbook detail with questions
 */
workbooks.get('/:id', async (c) => {
  const id = c.req.param('id');

  const wb = await c.env.DB.prepare('SELECT * FROM workbooks WHERE id = ?')
    .bind(id)
    .first();

  if (!wb) return c.json({ error: 'Workbook not found' }, 404);

  const questions = await c.env.DB.prepare(
    `SELECT q.*, wq.position
     FROM workbook_questions wq
     JOIN questions q ON wq.question_id = q.id
     WHERE wq.workbook_id = ?
     ORDER BY wq.position`,
  )
    .bind(id)
    .all();

  return c.json({ workbook: wb, questions: questions.results });
});

/**
 * POST /api/workbooks/:id/update
 * Rename a workbook.
 * Body: { name }
 *
 * @return success
 */
workbooks.post('/:id/update', async (c) => {
  const id = c.req.param('id');
  const { name } = await c.req.json<{ name: string }>();

  await c.env.DB.prepare(
    "UPDATE workbooks SET name = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(name, id)
    .run();

  return c.json({ ok: true });
});

/**
 * POST /api/workbooks/:id/delete
 * Delete workbook and its questions.
 *
 * @return success
 */
workbooks.post('/:id/delete', async (c) => {
  const id = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM workbook_questions WHERE workbook_id = ?')
    .bind(id)
    .run();
  await c.env.DB.prepare('DELETE FROM workbooks WHERE id = ?')
    .bind(id)
    .run();

  return c.json({ ok: true });
});

/**
 * POST /api/workbooks/:id/questions
 * Add a question to workbook.
 * Body: { questionId }
 *
 * @return success
 */
workbooks.post('/:id/questions', async (c) => {
  const id = c.req.param('id');
  const { questionId } = await c.req.json<{ questionId: number }>();

  /** Get next position */
  const max = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(position), 0) as max_pos FROM workbook_questions WHERE workbook_id = ?',
  )
    .bind(id)
    .first<{ max_pos: number }>();

  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO workbook_questions (workbook_id, question_id, position) VALUES (?, ?, ?)',
  )
    .bind(id, questionId, (max?.max_pos ?? 0) + 1)
    .run();

  await c.env.DB.prepare(
    "UPDATE workbooks SET updated_at = datetime('now') WHERE id = ?",
  )
    .bind(id)
    .run();

  return c.json({ ok: true });
});

/**
 * POST /api/workbooks/:id/questions/remove
 * Remove a question from workbook.
 * Body: { questionId }
 *
 * @return success
 */
workbooks.post('/:id/questions/remove', async (c) => {
  const id = c.req.param('id');
  const { questionId } = await c.req.json<{ questionId: number }>();

  await c.env.DB.prepare(
    'DELETE FROM workbook_questions WHERE workbook_id = ? AND question_id = ?',
  )
    .bind(id, questionId)
    .run();

  await c.env.DB.prepare(
    "UPDATE workbooks SET updated_at = datetime('now') WHERE id = ?",
  )
    .bind(id)
    .run();

  return c.json({ ok: true });
});

/**
 * POST /api/workbooks/:id/questions/reorder
 * Reorder questions in workbook.
 * Body: { questionIds: number[] }
 *
 * @return success
 */
workbooks.post('/:id/questions/reorder', async (c) => {
  const id = c.req.param('id');
  const { questionIds } = await c.req.json<{ questionIds: number[] }>();

  /** Update positions sequentially */
  const stmts = questionIds.map((qId, i) =>
    c.env.DB.prepare(
      'UPDATE workbook_questions SET position = ? WHERE workbook_id = ? AND question_id = ?',
    ).bind(i + 1, id, qId),
  );

  await c.env.DB.batch(stmts);

  return c.json({ ok: true });
});

export default workbooks;
