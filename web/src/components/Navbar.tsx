import { Link } from 'react-router-dom';
import Logo from './Logo';

/**
 * Top navigation bar
 * @return nav element
 */
export default function Navbar() {
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
          <a
            href="#signin"
            className="hidden sm:inline-flex items-center h-9 text-[13px] leading-none text-ink-muted hover:text-ink transition-colors px-3"
          >
            로그인
          </a>
          <a
            href="#start"
            className="inline-flex items-center gap-1.5 h-9 text-[13px] leading-none font-medium text-paper bg-ink hover:bg-ink-soft transition-colors px-4 rounded-full"
          >
            시작하기
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
