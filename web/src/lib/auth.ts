/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

/** Google OAuth client ID */
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** Stored user data in localStorage */
export type StoredUser = {
  id: number;
  email: string;
  name: string;
  user_id: string;
  role: 'teacher' | 'student';
  picture: string;
  class_name: string;
};

/** Google profile returned when onboarding is needed */
export type GoogleProfile = {
  email: string;
  name: string;
  picture: string;
};

/** localStorage key for user data */
const USER_KEY = 'echo-user';

/**
 * Get stored user from localStorage.
 *
 * @return stored user or null
 */
export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as StoredUser;
}

/**
 * Save user to localStorage.
 *
 * @param user user data to store
 * @return void
 */
export function saveUser(user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Remove user from localStorage.
 *
 * @return void
 */
export function clearUser(): void {
  localStorage.removeItem(USER_KEY);
}

/**
 * Build Google OAuth authorization URL and redirect.
 *
 * @return void
 */
export function redirectToGoogle(): void {
  const redirectUri = window.location.origin + '/';
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchange authorization code with backend.
 *
 * @param code Google authorization code
 * @return callback response from API
 */
export async function exchangeCode(code: string): Promise<{
  user?: StoredUser;
  isNew?: boolean;
  needsOnboarding?: boolean;
  email?: string;
  name?: string;
  picture?: string;
}> {
  const redirectUri = window.location.origin + '/';
  const res = await fetch(`${API}/api/auth/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  });
  if (!res.ok) throw new Error('Auth callback failed');
  return res.json();
}

/**
 * Register a new user after onboarding.
 *
 * @param profile Google profile
 * @param data onboarding form data
 * @return created user
 */
export async function registerUser(
  profile: GoogleProfile,
  data: { role: string; userName: string; userId: string; className?: string },
): Promise<StoredUser> {
  const res = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      ...data,
    }),
  });
  if (!res.ok) throw new Error('Registration failed');
  const result = await res.json();
  return result.user as StoredUser;
}
