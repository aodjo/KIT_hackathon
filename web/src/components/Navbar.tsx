import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from './Logo';
import { redirectToGoogle, getStoredUser, clearUser } from '../lib/auth';

/**
 * Top navigation bar.
 *
 * @return nav element
 */
export default function Navbar() {
  /** Current user */
  const user = getStoredUser();
  /** Dropdown open state */
  const [open, setOpen] = useState(false);
  /** Dropdown container ref for outside click */
  const dropdownRef = useRef<HTMLDivElement>(null);
  /** Router navigation */
  const navigate = useNavigate();

  /** Close dropdown on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /**
   * Handle logout.
   *
   * @return void
   */
  const handleLogout = () => {
    clearUser();
    window.location.href = '/';
  };

  return (
    <header className="w-full border-b border-grain/80 bg-paper/80 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 h-16 flex items-center justify-between">
        <Logo />

        <div className="flex items-center gap-3">
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2.5 h-9 cursor-pointer"
              >
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
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                  className={`text-ink-muted transition-transform shrink-0 ml-0.5 ${open ? 'rotate-180' : ''}`}
                >
                  <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {open && (
                <div className="absolute right-0 mt-2 w-44 border border-grain bg-paper rounded-lg shadow-paper-lg py-1 z-50">
                  <button
                    onClick={() => { setOpen(false); navigate('/profile'); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-ink hover:bg-grain/50 transition-colors cursor-pointer"
                  >
                    내 정보
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-ink hover:bg-grain/50 transition-colors cursor-pointer"
                  >
                    로그아웃
                  </button>
                </div>
              )}
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
