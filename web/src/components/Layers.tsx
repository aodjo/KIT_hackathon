import type { ReactNode } from 'react';

/** Section card data */
type Chapter = {
  num: string;
  en: string;
  ko: string;
  tag: string;
  body: string;
  visual: ReactNode;
};

/** Vertical bar waveform SVG */
function WhisperVisual() {
  return (
    <svg viewBox="0 0 320 120" className="w-full h-auto" aria-hidden="true">
      <g stroke="#0A0A0A" strokeWidth="1" strokeLinecap="round" opacity="0.85">
        {Array.from({ length: 48 }).map((_, i) => {
          const x = 8 + i * 6.5;
          const seed = Math.sin(i * 0.7) * Math.cos(i * 0.3);
          const h = 6 + Math.abs(seed) * 44;
          const o = i > 28 && i < 36 ? 0.15 : 1;
          return (
            <line
              key={i}
              x1={x}
              y1={60 - h / 2}
              x2={x}
              y2={60 + h / 2}
              opacity={o}
            />
          );
        })}
      </g>
      <text
        x="200"
        y="105"
        fontFamily="Instrument Serif, serif"
        fontSize="11"
        fontStyle="italic"
        fill="#6B5435"
      >
        "여기서부터 막힌 거 맞죠?"
      </text>
    </svg>
  );
}

/** Connected node tree SVG */
function TracerVisual() {
  return (
    <svg viewBox="0 0 320 120" className="w-full h-auto" aria-hidden="true">
      <g stroke="#0A0A0A" strokeWidth="1" fill="none" opacity="0.85">
        <circle cx="260" cy="24" r="5" fill="#0A0A0A" />
        <line x1="260" y1="29" x2="220" y2="52" />
        <circle cx="220" cy="56" r="4" />
        <line x1="220" y1="60" x2="180" y2="80" />
        <circle cx="180" cy="84" r="4" />
        <line x1="180" y1="88" x2="140" y2="104" />
        <circle cx="140" cy="108" r="6" stroke="#8B6F47" strokeWidth="1.5" fill="#FAFAF7" />
        <line x1="260" y1="29" x2="150" y2="100" strokeDasharray="2 3" opacity="0.35" />
      </g>
      <text x="16" y="28" fontFamily="Inter, sans-serif" fontSize="10" fill="#3A3A3A" letterSpacing="0.06em">증상</text>
      <text x="16" y="112" fontFamily="Inter, sans-serif" fontSize="10" fill="#6B5435" letterSpacing="0.06em">원인</text>
    </svg>
  );
}

/** Two circles with bidirectional arrows SVG */
function MirrorVisual() {
  return (
    <svg viewBox="0 0 320 120" className="w-full h-auto" aria-hidden="true">
      <g stroke="#0A0A0A" strokeWidth="1" fill="none" opacity="0.9">
        <circle cx="100" cy="60" r="26" />
        <text x="100" y="65" textAnchor="middle" fontFamily="Instrument Serif, serif" fontSize="18" fill="#0A0A0A">학생</text>
        <path d="M 130 54 L 186 54" strokeWidth="1.2" markerEnd="url(#arrow)" />
        <path d="M 186 66 L 130 66" strokeWidth="1.2" strokeDasharray="2 2" markerEnd="url(#arrowBack)" />
        <circle cx="216" cy="60" r="26" strokeDasharray="2 3" />
        <text x="216" y="65" textAnchor="middle" fontFamily="Instrument Serif, serif" fontSize="14" fontStyle="italic" fill="#6B5435">과거 자아</text>
      </g>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0A0A0A" />
        </marker>
        <marker id="arrowBack" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 10 0 L 0 5 L 10 10 z" fill="#6B5435" />
        </marker>
      </defs>
      <text x="158" y="46" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#3A3A3A" letterSpacing="0.08em">가르침</text>
      <text x="158" y="82" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#6B5435" letterSpacing="0.08em">질문</text>
    </svg>
  );
}

/** Three section cards */
const chapters: Chapter[] = [
  {
    num: '01',
    en: 'Whisper',
    ko: '숨은 질문 탐지기',
    tag: '감지',
    body: '학생이 질문하지 못하는 순간을 포착합니다. 스크롤 패턴, 체류 시간, 지웠다 다시 쓴 흔적, 오답의 결 — 이 미세 신호를 AI가 "학생이 지금 하고 싶었던 질문"으로 추론해 교강사에게 전달합니다.',
    visual: <WhisperVisual />,
  },
  {
    num: '02',
    en: 'Misconception Tracer',
    ko: '오개념 원인 분석기',
    tag: '진단',
    body: '오답의 원인을 수년 전 선수개념까지 역추적합니다. 지금 고2에서 틀린 미적분 문제가, 사실은 중3의 함수 개념에서 비롯된 것임을 지식 그래프 위에서 드러냅니다.',
    visual: <TracerVisual />,
  },
  {
    num: '03',
    en: 'MirrorMind',
    ko: '설명 학습 파트너',
    tag: '치유',
    body: '학생의 과거 오답과 사고 흐름으로 학습된 AI가 "학생의 과거 자아"가 됩니다. 학생은 이 AI 후배에게 개념을 설명하며, 자신이 어디서 막히는지 스스로 깨닫게 됩니다.',
    visual: <MirrorVisual />,
  },
];

/**
 * How-it-works section
 * @return section element
 */
export default function Layers() {
  return (
    <section id="concept" className="w-full border-t border-grain">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-28 lg:py-36">
        {/* section intro */}
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2.5 text-clay-deep">
            <span className="w-1 h-1 rounded-full bg-clay" />
            <span className="text-[13px] font-medium">세 개의 층</span>
            <span className="text-[10px] uppercase tracking-[0.14em] font-mono opacity-60">3 Layers</span>
          </span>
          <h2 className="mt-8 font-display text-[44px] leading-[1.05] tracking-tight-display text-ink text-balance sm:text-[56px] lg:text-[64px]">
            메타인지는
            <br />
            이렇게 만들어집니다.
          </h2>
          <p className="mt-8 text-[16px] leading-[1.65] text-ink-muted max-w-xl text-pretty">
            Echo는 세 개의 AI 에이전트가 순차적으로 작동하는 학습 파이프라인입니다.
            감지하고, 진단하고, 치유합니다.
          </p>
        </div>

        {/* chapter rows */}
        <div className="mt-24 space-y-0">
          {chapters.map((c, i) => (
            <article
              key={c.num}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 py-16 border-t border-grain first:border-t-0"
            >
              {/* left: number + tag + title */}
              <div className="lg:col-span-5 flex flex-col">
                <div className="flex items-baseline gap-4">
                  <span className="font-display italic text-[88px] leading-none text-ink lg:text-[112px]">
                    {c.num}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.16em] text-clay-deep font-medium pb-3">
                    {c.tag}
                  </span>
                </div>
                <div className="mt-4">
                  <div className="font-display italic text-[20px] leading-none text-clay-deep">
                    {c.en}
                  </div>
                  <h3 className="mt-3 font-display text-[32px] leading-[1.15] tracking-tight-display text-ink lg:text-[40px]">
                    {c.ko}
                  </h3>
                </div>
              </div>

              {/* right: body + visual */}
              <div className="lg:col-span-7 flex flex-col gap-8 lg:pt-8">
                <p className="text-[16px] leading-[1.7] text-ink-muted text-pretty max-w-xl">
                  {c.body}
                </p>
                <div className="mt-auto border border-grain bg-paper/60 rounded-sm p-6 lg:p-8">
                  {c.visual}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
