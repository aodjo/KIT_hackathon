import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './db/types';
import auth from './routes/auth';
import classes from './routes/classes';
import assignments from './routes/assignments';

/** Hono app instance */
const app = new Hono<{ Bindings: Env }>();

/** CORS for local dev */
app.use('/api/*', cors({ origin: '*' }));

/** Routes */
app.route('/api/auth', auth);
app.route('/api/classes', classes);
app.route('/api/assignments', assignments);

/**
 * Health check endpoint.
 * @return JSON response
 */
app.get('/api/health', (c) => c.json({ status: 'ok' }));

export default app;
