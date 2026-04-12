import { Link } from 'react-router-dom';
import Logo from './Logo';

/**
 * Landing page footer
 * @return footer element
 */
export default function Footer() {
  return (
    <footer className="w-full border-t border-grain">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-16 lg:py-20">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-12 lg:gap-16">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-5 text-[13px] leading-[1.7] text-ink-muted">
              학생이 가르치는 학습.
              <br />
              가르치며 깊이 이해합니다.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
                Product
              </div>
              <ul className="mt-4 space-y-2.5 text-[13px] text-ink-muted">
                <li>
                  <Link to="/articles" className="hover:text-ink transition-colors">
                    아티클
                  </Link>
                </li>
                <li>
                  <Link to="/knowledgemap" className="hover:text-ink transition-colors">
                    개념 지도
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
                Contact
              </div>
              <ul className="mt-4 space-y-2.5 text-[13px] text-ink-muted">
                <li>
                  <a href="mailto:me@junx.dev" className="hover:text-ink transition-colors">
                    이메일
                  </a>
                </li>
                <li>
                  <a href="https://github.com/aodjo/KIT_hackathon" className="hover:text-ink transition-colors">
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-grain/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-[11px] text-ink-muted font-mono">
            Copyright 2026 Junsung Lee. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
