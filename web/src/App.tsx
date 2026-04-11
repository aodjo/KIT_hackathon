import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useLocation, useSearchParams } from 'react-router-dom';
import Landing from './pages/Landing';
import Articles from './pages/Articles';
import Article from './pages/Article';
import Dashboard from './pages/Dashboard';
import Learn from './pages/Learn';
import Profile from './pages/Profile';
import WorkbookEditor from './pages/WorkbookEditor';
import AssignmentDetail from './pages/AssignmentDetail';
import StudentDashboard from './pages/StudentDashboard';
import StudentAssignment from './pages/StudentAssignment';
import TeacherStudentAssignmentView from './pages/TeacherStudentAssignmentView';
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
 * Route by user role: teacher gets A, student gets B.
 *
 * @param props.teacher teacher component
 * @param props.student student component
 * @return role-appropriate element
 */
/**
 * 403 page.
 *
 * @return forbidden element
 */
function Forbidden() {
  return (
    <div className="min-h-screen font-display bg-paper-grain flex flex-col items-center justify-center">
      <p className="text-[64px] font-display text-ink mb-2">403</p>
      <p className="text-[16px] text-ink-muted mb-6">접근 권한이 없습니다.</p>
      <a href="/" className="h-10 px-5 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors flex items-center">
        홈으로 돌아가기
      </a>
    </div>
  );
}

function RoleRoute({ teacher, student }: { teacher: JSX.Element; student: JSX.Element }) {
  const user = getStoredUser();
  if (!user) return <Forbidden />;
  return user.role === 'teacher' ? teacher : student;
}

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
  return <StudentDashboard />;
}

/**
 * App root with client-side routing.
 *
 * @return root element
 */
/**
 * 404 page.
 *
 * @return not found element
 */
function NotFound() {
  return (
    <div className="min-h-screen font-display bg-paper-grain flex flex-col items-center justify-center">
      <p className="text-[64px] font-display text-ink mb-2">404</p>
      <p className="text-[16px] text-ink-muted mb-6">페이지를 찾을 수 없습니다.</p>
      <a href="/" className="h-10 px-5 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors flex items-center">
        홈으로 돌아가기
      </a>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<RootPage />} />
        <Route path="/c/:classId" element={<RoleRoute teacher={<Dashboard />} student={<StudentDashboard />} />} />
        <Route path="/c/:classId/a/:id" element={<RoleRoute teacher={<AssignmentDetail />} student={<StudentAssignment />} />} />
        <Route path="/c/:classId/a/:id/student/:studentId" element={<RoleRoute teacher={<TeacherStudentAssignmentView />} student={<Forbidden />} />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/workbook/:id" element={(() => { const u = getStoredUser(); if (!u) return <Forbidden />; if (u.role !== 'teacher') return <Forbidden />; return <WorkbookEditor />; })()} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/articles/date/:date" element={<Articles />} />
        <Route path="/articles/:slug" element={<Article />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
