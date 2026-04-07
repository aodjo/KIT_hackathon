import { Hono } from 'hono';
import type { Env } from '../db/types';

/** Classes router */
const classes = new Hono<{ Bindings: Env }>();

/**
 * Generate 6-char invite code.
 * @return random uppercase code
 */
function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * POST /api/classes
 * Teacher creates a class.
 * Body: { teacherId, name }
 */
classes.post('/', async (c) => {
  const { teacherId, name } = await c.req.json<{
    teacherId: number;
    name: string;
  }>();

  const code = generateCode();

  const result = await c.env.DB.prepare(
    'INSERT INTO classes (name, teacher_id, code) VALUES (?, ?, ?)',
  )
    .bind(name, teacherId, code)
    .run();

  return c.json({
    id: result.meta.last_row_id,
    name,
    code,
    teacherId,
  });
});

/**
 * GET /api/classes/:id
 * Get class details with member count.
 */
classes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const cls = await c.env.DB.prepare(
    'SELECT * FROM classes WHERE id = ?',
  )
    .bind(id)
    .first();

  if (!cls) return c.json({ error: 'Class not found' }, 404);

  const members = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.user_id, u.picture
     FROM class_members cm JOIN users u ON cm.student_id = u.id
     WHERE cm.class_id = ?`,
  )
    .bind(id)
    .all();

  return c.json({ class: cls, members: members.results });
});

/**
 * GET /api/classes/teacher/:teacherId
 * List all classes for a teacher.
 */
classes.get('/teacher/:teacherId', async (c) => {
  const teacherId = c.req.param('teacherId');

  const result = await c.env.DB.prepare(
    `SELECT c.*, COUNT(cm.student_id) as member_count
     FROM classes c LEFT JOIN class_members cm ON c.id = cm.class_id
     WHERE c.teacher_id = ?
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
  )
    .bind(teacherId)
    .all();

  return c.json({ classes: result.results });
});

/**
 * POST /api/classes/join
 * Student joins a class by invite code.
 * Body: { studentId, code }
 */
classes.post('/join', async (c) => {
  const { studentId, code } = await c.req.json<{
    studentId: number;
    code: string;
  }>();

  const cls = await c.env.DB.prepare(
    'SELECT * FROM classes WHERE code = ?',
  )
    .bind(code)
    .first();

  if (!cls) return c.json({ error: 'Invalid code' }, 404);

  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO class_members (class_id, student_id) VALUES (?, ?)',
  )
    .bind(cls.id, studentId)
    .run();

  return c.json({ class: cls });
});

/**
 * GET /api/classes/student/:studentId
 * List all classes a student belongs to.
 */
classes.get('/student/:studentId', async (c) => {
  const studentId = c.req.param('studentId');

  const result = await c.env.DB.prepare(
    `SELECT c.* FROM classes c
     JOIN class_members cm ON c.id = cm.class_id
     WHERE cm.student_id = ?
     ORDER BY cm.joined_at DESC`,
  )
    .bind(studentId)
    .all();

  return c.json({ classes: result.results });
});

/**
 * POST /api/classes/:id/update
 * Update class name.
 * Body: { name }
 */
classes.post('/:id/update', async (c) => {
  const id = c.req.param('id');
  const { name } = await c.req.json<{ name: string }>();

  await c.env.DB.prepare('UPDATE classes SET name = ? WHERE id = ?')
    .bind(name, id)
    .run();

  return c.json({ ok: true });
});

/**
 * POST /api/classes/:id/delete
 * Delete a class and its members.
 * Body: (none)
 */
classes.post('/:id/delete', async (c) => {
  const id = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM class_members WHERE class_id = ?')
    .bind(id)
    .run();
  await c.env.DB.prepare('DELETE FROM classes WHERE id = ?')
    .bind(id)
    .run();

  return c.json({ ok: true });
});

export default classes;
