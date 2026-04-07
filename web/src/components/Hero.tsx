import { redirectToGoogle } from '../lib/auth';

/**
 * Landing hero section.
 *
 * @return hero element
 */
export default function Hero() {
  return (
    <section className="relative w-full overflow-hidden min-h-[calc(100vh-4rem)] flex items-center">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-16 lg:py-20 w-full">
        {/* eyebrow badge */}
        <div className="flex items-center gap-2.5 mb-10">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-clay-deep font-medium">
            <span className="w-1 h-1 rounded-full bg-clay" />
            Protégé Effect · Cognitive Science
          </span>
        </div>

        {/* headline */}
        <h1 className="font-display text-[56px] leading-[1.02] tracking-tighter-display text-ink text-balance max-w-5xl sm:text-[72px] lg:text-[96px]">
          학생이 가르치고,
          <br />
          <span className="italic">AI가 배웁니다.</span>
        </h1>

        {/* subhead */}
        <p className="mt-10 text-[17px] leading-[1.6] text-ink-muted font-display max-w-2xl text-pretty">
          Echo는 AI가 학생을 가르치는 도구가 아닙니다.
          학생의 과거 오답과 사고 흐름을 학습한 AI가 <em className="not-italic font-medium text-ink">학생의 과거 자아</em>가 되어,
          학생은 이 AI를 가르치며 자신의 메타인지를 훈련합니다.
        </p>

        {/* CTA buttons */}
        <div className="mt-12 font-display flex flex-wrap items-center gap-4">
          <button
            onClick={redirectToGoogle}
            className="inline-flex items-center gap-2 text-[14px] font-medium text-paper bg-ink hover:bg-ink-soft transition-colors px-6 py-3.5 rounded-full cursor-pointer"
          >
            시작하기
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path d="M6 4l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <a
            href="#concept"
            className="inline-flex items-center gap-2 text-[14px] font-medium text-ink hover:text-clay-deep transition-colors px-2 py-3.5"
          >
            어떻게 작동하나요
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        {/* footnote */}
        <div className="mt-24 pt-8 border-t border-grain max-w-2xl flex items-start gap-6">
          <span className="font-display italic text-[13px] text-clay-deep shrink-0 pt-0.5">
            Note
          </span>
          <p className="text-[13px] leading-[1.65] font-display text-ink-muted">
            가르치는 행위는 학습 효과가 가장 강력한 행동입니다.
            Chase et al.(2009)의 Teachable Agents 연구는, 가르칠 대상이 있을 때 학습자가 개념을 훨씬 깊이 이해한다는 것을 입증했습니다.
            Echo는 이 효과를 생성형 AI로 재현합니다.
          </p>
        </div>
      </div>

      {/* background decoration */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/3 pointer-events-none opacity-[0.06] hidden lg:block" aria-hidden="true">
        <svg width="640" height="640" viewBox="0 0 640 640" fill="none">
          <circle cx="320" cy="320" r="40" fill="#0A0A0A" />
          <circle cx="320" cy="320" r="100" stroke="#0A0A0A" strokeWidth="1.5" />
          <circle cx="320" cy="320" r="180" stroke="#0A0A0A" strokeWidth="1.5" />
          <circle cx="320" cy="320" r="260" stroke="#0A0A0A" strokeWidth="1.5" />
          <circle cx="320" cy="320" r="320" stroke="#0A0A0A" strokeWidth="1.5" />
        </svg>
      </div>
    </section>
  );
}
