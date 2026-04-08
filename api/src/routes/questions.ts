import { Hono } from 'hono';
import type { Env } from '../db/types';

/** Questions router */
const questions = new Hono<{ Bindings: Env }>();

/**
 * GET /api/questions
 * List questions filtered by school_level, grade, curriculum_topic.
 *
 * @return filtered question list
 */
questions.get('/', async (c) => {
  const school = c.req.query('school_level');
  const grade = c.req.query('grade');
  const topic = c.req.query('curriculum_topic');

  /** Build dynamic WHERE clause */
  const conditions: string[] = [];
  const params: string[] = [];

  if (school) {
    conditions.push('school_level = ?');
    params.push(school);
  }
  if (grade) {
    conditions.push('grade = ?');
    params.push(grade);
  }
  if (topic) {
    conditions.push('curriculum_topic = ?');
    params.push(topic);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = c.env.DB.prepare(
    `SELECT * FROM questions ${where} ORDER BY id`,
  );
  const result = await (params.length > 0 ? stmt.bind(...params) : stmt).all();

  return c.json({ questions: result.results });
});

/**
 * GET /api/questions/topics
 * Get distinct topics grouped by school_level and grade.
 *
 * @return topic tree
 */
questions.get('/topics', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT DISTINCT school_level, grade, curriculum_topic, COUNT(*) as count
     FROM questions
     GROUP BY school_level, grade, curriculum_topic
     ORDER BY school_level, grade, curriculum_topic`,
  ).all();

  return c.json({ topics: result.results });
});

export default questions;
