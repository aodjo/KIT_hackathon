import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './db/types';
import auth from './routes/auth';
import classes from './routes/classes';
import assignments from './routes/assignments';
import questions from './routes/questions';
import workbooks from './routes/workbooks';
import whisper from './routes/whisper';
import mirror from './routes/mirror';
import curriculum from './routes/curriculum';

/** Hono app instance */
const app = new Hono<{ Bindings: Env }>();

/** CORS for local dev */
app.use('/api/*', cors({ origin: '*' }));

/**
 * Return JSON errors for API routes so the client never crashes on plain-text 500s.
 */
app.onError((err, c) => {
  console.error(err);

  if (c.req.path.startsWith('/api/')) {
    const message = c.env.ENVIRONMENT === 'development' && err instanceof Error
      ? err.message
      : 'Internal Server Error';
    return c.json({ error: message }, 500);
  }

  return c.text('Internal Server Error', 500);
});

/** Routes */
app.route('/api/auth', auth);
app.route('/api/classes', classes);
app.route('/api/assignments', assignments);
app.route('/api/questions', questions);
app.route('/api/curriculum', curriculum);
app.route('/api/workbooks', workbooks);
app.route('/api/whisper', whisper);
app.route('/api/mirror', mirror);

/**
 * Health check endpoint.
 * @return JSON response
 */
app.get('/api/health', (c) => c.json({ status: 'ok' }));

export default app;
