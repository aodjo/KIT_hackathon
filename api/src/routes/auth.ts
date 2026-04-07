import { Hono } from 'hono';
import type { Env, User } from '../db/types';

/** Auth router */
const auth = new Hono<{ Bindings: Env }>();

/** Google token endpoint response */
type GoogleTokenRes = {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
};

/** Google userinfo response */
type GoogleProfile = {
  email: string;
  name: string;
  picture: string;
};

/**
 * Exchange authorization code for access token via Google OAuth.
 *
 * @param code authorization code from Google redirect
 * @param clientId Google OAuth client ID
 * @param clientSecret Google OAuth client secret
 * @param redirectUri redirect URI matching the one used in the auth request
 * @return access token string
 */
async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  const data = (await res.json()) as GoogleTokenRes;
  return data.access_token;
}

/**
 * Fetch Google user profile with access token.
 *
 * @param accessToken Google OAuth access token
 * @return Google user profile
 */
async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Google profile');
  return res.json() as Promise<GoogleProfile>;
}

/**
 * POST /api/auth/callback
 * Exchange Google authorization code for user profile.
 * Returns existing user or signals onboarding is needed.
 * Body: { code, redirectUri, role?, userName?, userId?, className? }
 */
auth.post('/callback', async (c) => {
  const body = await c.req.json<{
    code: string;
    redirectUri: string;
    role?: string;
    userName?: string;
    userId?: string;
    className?: string;
  }>();

  /** Exchange code for token, then fetch profile */
  let accessToken: string;
  try {
    accessToken = await exchangeCode(
      body.code,
      c.env.GOOGLE_CLIENT_ID,
      c.env.GOOGLE_CLIENT_SECRET,
      body.redirectUri,
    );
  } catch (e) {
    return c.json({ error: 'Invalid authorization code' }, 400);
  }
  const profile = await fetchProfile(accessToken);

  /** Check if user already exists */
  const existing = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?',
  )
    .bind(profile.email)
    .first<User>();

  if (existing) {
    return c.json({ user: existing, isNew: false });
  }

  /** New user without onboarding fields: signal client to show onboarding */
  if (!body.role || !body.userName || !body.userId) {
    return c.json({
      needsOnboarding: true,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });
  }

  /** Insert new user */
  const result = await c.env.DB.prepare(
    `INSERT INTO users (email, name, user_id, role, picture, class_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      profile.email,
      body.userName,
      body.userId,
      body.role,
      profile.picture ?? '',
      body.className ?? '',
    )
    .run();

  /** Fetch the created user */
  const newUser = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?',
  )
    .bind(result.meta.last_row_id)
    .first<User>();

  return c.json({ user: newUser, isNew: true });
});

/**
 * POST /api/auth/register
 * Complete onboarding for a Google-authenticated user.
 * Body: { email, role, userName, userId, className? }
 */
auth.post('/register', async (c) => {
  const body = await c.req.json<{
    email: string;
    name: string;
    picture: string;
    role: string;
    userName: string;
    userId: string;
    className?: string;
  }>();

  /** Prevent duplicate registration */
  const existing = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?',
  )
    .bind(body.email)
    .first<User>();

  if (existing) {
    return c.json({ user: existing, isNew: false });
  }

  /** Insert new user */
  const result = await c.env.DB.prepare(
    `INSERT INTO users (email, name, user_id, role, picture, class_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      body.email,
      body.userName,
      body.userId,
      body.role,
      body.picture ?? '',
      body.className ?? '',
    )
    .run();

  const newUser = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?',
  )
    .bind(result.meta.last_row_id)
    .first<User>();

  return c.json({ user: newUser, isNew: true });
});

/**
 * GET /api/auth/me
 * Get current user by email header.
 */
auth.get('/me', async (c) => {
  const email = c.req.header('X-User-Email');
  if (!email) return c.json({ error: 'No email provided' }, 401);

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?',
  )
    .bind(email)
    .first<User>();

  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json({ user });
});

export default auth;
