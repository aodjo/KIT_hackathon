import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useLocation, useSearchParams } from 'react-router-dom';
import Landing from './pages/Landing';
import Articles from './pages/Articles';
import Article from './pages/Article';
import Dashboard from './pages/Dashboard';
import Learn from './pages/Learn';
import Navbar from './components/Navbar';
import Onboarding from './components/Onboarding';
import {
  getStoredUser,
  exchangeCode,
  saveUser,
  type StoredUser,
  type GoogleProfile,
} from './lib/auth';

/**
 * Scroll window to top on route change.
 *
 * @return null
 */
function ScrollToTop() {
  /** Current route pathname */
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Auth state discriminated union */
type AuthState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'onboarding'; profile: GoogleProfile }
  | { status: 'authenticated'; user: StoredUser };

/**
 * Root page that renders based on auth state.
 *
 * @return root element
 */
function RootPage() {
  /** Auth state */
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  /** URL search params for OAuth code */
  const [searchParams, setSearchParams] = useSearchParams();
  /** Guard against StrictMode double-invoke */
  const codeHandled = useRef(false);

  /**
   * Handle OAuth callback code in URL.
   *
   * @return void
   */
  const handleOAuthCode = useCallback(async (code: string) => {
    /** Remove code from URL */
    setSearchParams({}, { replace: true });

    try {
      const result = await exchangeCode(code);

      if (result.user) {
        saveUser(result.user);
        setAuth({ status: 'authenticated', user: result.user });
      } else if (result.needsOnboarding) {
        setAuth({
          status: 'onboarding',
          profile: {
            email: result.email!,
            name: result.name!,
            picture: result.picture!,
          },
        });
      }
    } catch {
      setAuth({ status: 'guest' });
    }
  }, [setSearchParams]);

  /** Check auth on mount */
  useEffect(() => {
    if (codeHandled.current) return;

    const code = searchParams.get('code');

    if (code) {
      codeHandled.current = true;
      handleOAuthCode(code);
      return;
    }

    const stored = getStoredUser();
    if (stored) {
      setAuth({ status: 'authenticated', user: stored });
    } else {
      setAuth({ status: 'guest' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Called when onboarding completes.
   *
   * @return void
   */
  const handleOnboardingComplete = () => {
    const user = getStoredUser();
    if (user) {
      setAuth({ status: 'authenticated', user });
    }
  };

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen bg-paper-grain flex items-center justify-center">
        <p className="text-[14px] text-ink-muted font-mono">로딩 중...</p>
      </div>
    );
  }

  if (auth.status === 'guest') {
    return <Landing />;
  }

  if (auth.status === 'onboarding') {
    return (
      <div className="min-h-screen font-display bg-paper-grain flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Onboarding
            profile={auth.profile}
            onComplete={handleOnboardingComplete}
          />
        </main>
      </div>
    );
  }

  /** Authenticated: render by role */
  if (auth.user.role === 'teacher') {
    return <Dashboard />;
  }
  return <Learn />;
}

/**
 * App root with client-side routing.
 *
 * @return root element
 */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<RootPage />} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/articles/date/:date" element={<Articles />} />
        <Route path="/articles/:slug" element={<Article />} />
      </Routes>
    </>
  );
}
