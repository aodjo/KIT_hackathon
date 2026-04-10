import { Hono } from 'hono';
import type { Env } from '../db/types';
import { getCurriculumSnapshot } from '../lib/curriculum';

/** Curriculum router */
const curriculum = new Hono<{ Bindings: Env }>();

/**
 * GET /api/curriculum/concepts/:conceptId
 * Return current concept metadata and prerequisite lineage.
 *
 * @return concept snapshot
 */
curriculum.get('/concepts/:conceptId', async (c) => {
  const conceptId = c.req.param('conceptId');
  const snapshot = getCurriculumSnapshot(conceptId);

  if (!snapshot.concept) {
    return c.json({ error: 'Concept not found' }, 404);
  }

  return c.json(snapshot);
});

/**
 * GET /api/curriculum/questions/:questionId
 * Resolve a question to its concept and return the prerequisite lineage.
 *
 * @return question + concept snapshot
 */
curriculum.get('/questions/:questionId', async (c) => {
  const questionId = c.req.param('questionId');

  const question = await c.env.DB.prepare(
    `SELECT id, concept_id, school_level, grade, curriculum_topic
     FROM questions
     WHERE id = ?`,
  )
    .bind(questionId)
    .first<{
      id: number;
      concept_id: string;
      school_level: string;
      grade: string;
      curriculum_topic: string;
    }>();

  if (!question) {
    return c.json({ error: 'Question not found' }, 404);
  }

  const snapshot = getCurriculumSnapshot(question.concept_id);

  return c.json({
    question,
    ...snapshot,
  });
});

export default curriculum;
