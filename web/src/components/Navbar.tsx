import { Link } from 'react-router-dom';
import Logo from './Logo';
import { redirectToGoogle, getStoredUser } from '../lib/auth';

/**
 * Top navigation bar.
 *
 * @return nav element
 */
export default function Navbar() {
  /** Current user */
  const user = getStoredUser();

  return (
    <header className="w-full border-b border-grain/80 bg-paper/80 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 h-16 flex items-center justify-between">
        <Logo />

        <nav className="hidden md:flex items-center gap-10 text-[13px] text-ink-muted">
          <a href="#concept" className="hover:text-ink transition-colors">컨셉</a>
          <a href="#features" className="hover:text-ink transition-colors">기능</a>
          <Link to="/articles" className="hover:text-ink transition-colors">아티클</Link>
          <a href="#demo" className="hover:text-ink transition-colors">데모</a>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2.5">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-7 h-7 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-grain flex items-center justify-center text-[11px] font-medium text-ink">
                  {user.name.charAt(0)}
                </div>
              )}
              <span className="text-[13px] text-ink font-medium tracking-widest">
                {user.name}{' '}
                <span className="text-ink-muted font-normal">({user.user_id})</span>
              </span>
            </div>
          ) : (
            <button
              onClick={redirectToGoogle}
              className="inline-flex items-center gap-1.5 h-9 text-[13px] font-display leading-none font-medium text-paper bg-ink hover:bg-ink-soft transition-colors px-4 rounded-full cursor-pointer"
            >
              시작하기
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
