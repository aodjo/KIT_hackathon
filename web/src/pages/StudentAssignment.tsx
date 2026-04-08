import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import AppLayout from '../components/AppLayout';
import { getStoredUser } from '../lib/auth';

/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

/** Question record */
type Question = {
  id: number;
  school_level: string;
  grade: string;
  curriculum_topic: string;
  difficulty: string;
  type: string;
  question: string;
  choices: string | null;
  answer: string;
  explanation: string;
};

/** Difficulty badge color */
const diffColor: Record<string, string> = {
  '상': 'text-red-500 border-red-200',
  '중': 'text-amber-600 border-amber-200',
  '하': 'text-emerald-600 border-emerald-200',
};

/**
 * Render text with inline LaTeX ($...$).
 *
 * @param props.text raw text
 * @param props.className optional CSS class
 * @return span with rendered math
 */
function Latex({ text, className }: { text: string; className?: string }) {
  const html = text.replace(/\$([^$]+)\$/g, (_, tex: string) => {
    try {
      return katex.renderToString(tex, { throwOnError: false });
    } catch {
      return tex;
    }
  });
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Student assignment solve page (one question at a time).
 *
 * @return solve page element
 */
export default function StudentAssignment() {
  const { id, classId } = useParams<{ id: string; classId: string }>();
  const navigate = useNavigate();
  const user = getStoredUser();

  /** Assignment title */
  const [title, setTitle] = useState('');
  /** Questions list */
  const [questions, setQuestions] = useState<Question[]>([]);
  /** Student answers keyed by question ID */
  const [answers, setAnswers] = useState<Record<number, string>>({});
  /** Current question index */
  const [currentIdx, setCurrentIdx] = useState(0);
  /** Submission result */
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null);
  /** Submitting state */
  const [submitting, setSubmitting] = useState(false);

  /** Fetch assignment info */
  useEffect(() => {
    if (!id) return;
    fetch(`${API}/api/assignments/${id}`)
      .then((r) => r.json())
      .then((d) => setTitle(d.assignment?.title ?? ''));
  }, [id]);

  /** Fetch questions */
  useEffect(() => {
    if (!id) return;
    fetch(`${API}/api/assignments/${id}/questions`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []));
  }, [id]);

  /** Current question */
  const q = questions[currentIdx];

  /**
   * Update answer for current question.
   *
   * @param value answer text
   * @return void
   */
  const setAnswer = (value: string) => {
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
  };

  /**
   * Go to next question.
   *
   * @return void
   */
  const goNext = () => {
    if (currentIdx < questions.length - 1) setCurrentIdx(currentIdx + 1);
  };

  /**
   * Go to previous question.
   *
   * @return void
   */
  const goPrev = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  /**
   * Submit all answers.
   *
   * @return void
   */
  const handleSubmit = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/assignments/${id}/submit-answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: user.id,
          answers: questions.map((q) => ({
            questionId: q.id,
            answer: answers[q.id]?.trim() ?? '',
          })),
        }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setSubmitting(false);
    }
  };

  /** Whether current question is answered */
  const currentAnswered = q ? !!answers[q.id]?.trim() : false;
  /** Whether on last question */
  const isLast = currentIdx === questions.length - 1;
  /** Answered count */
  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length;

  if (!user) return null;

  return (
    <AppLayout
      selectedClassId={classId}
      initialClassId={classId}
      onClickClass={(cls) => navigate(`/c/${cls.id}`)}
    >
      <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-6 py-10">
        {/* header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(`/c/${classId}`)}
            className="text-ink-muted hover:text-ink transition-colors cursor-pointer text-[14px] mb-4 block"
          >
            ← 돌아가기
          </button>
          <h1 className="font-display text-[28px] text-ink">{title}</h1>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[12px] text-ink-muted font-mono">
              {answeredCount}/{questions.length}문제 작성
            </p>
          </div>
          {/* question dots */}
          {questions.length > 0 && !result && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  className={`w-7 h-7 rounded-full text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                    i === currentIdx
                      ? 'bg-ink text-paper'
                      : answers[questions[i].id]?.trim()
                        ? 'bg-ink/20 text-ink'
                        : 'bg-grain/50 text-ink-muted'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* result */}
        {result ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className={`rounded-2xl p-10 border text-center ${
              result.correct === result.total
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-paper border-grain'
            }`}>
              <p className="text-[48px] font-display text-ink mb-2">
                {result.correct}/{result.total}
              </p>
              <p className="text-[16px] text-ink-muted">
                {result.correct === result.total
                  ? '모두 정답입니다!'
                  : `${result.total}문제 중 ${result.correct}문제 정답`}
              </p>
            </div>
            <button
              onClick={() => navigate(`/c/${classId}`)}
              className="mt-8 h-11 px-6 rounded-full bg-ink text-paper font-medium text-[14px] hover:bg-ink-soft transition-colors cursor-pointer"
            >
              돌아가기
            </button>
          </div>
        ) : q ? (
          <div className="flex-1 flex flex-col">
            {/* question card */}
            <div className="border border-grain rounded-lg p-8 bg-paper flex-1">
              {/* question meta */}
              <div className="flex items-center gap-2 mb-5">
                <span className="text-[14px] font-mono font-bold text-ink">{currentIdx + 1}.</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[q.difficulty] ?? ''}`}>
                  {q.difficulty}
                </span>
                <span className="text-[10px] font-mono text-ink-muted">{q.school_level} &gt; {q.grade} &gt; {q.curriculum_topic}</span>
              </div>

              {/* question text */}
              <Latex text={q.question} className="text-[18px] text-ink leading-relaxed block mb-6" />

              {/* answer area */}
              {q.type === '객관식' && q.choices ? (() => {
                const parsed = JSON.parse(q.choices) as Record<string, string>;
                return (
                  <div className="space-y-2">
                    {Object.entries(parsed).map(([k, v]) => {
                      const selected = answers[q.id] === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setAnswer(k)}
                          className={`w-full text-left px-5 py-3 rounded-lg border transition-colors cursor-pointer ${
                            selected
                              ? 'border-ink bg-ink/5'
                              : 'border-grain hover:border-ink/30'
                          }`}
                        >
                          <span className="text-[14px] font-mono text-ink-muted mr-3">{'①②③④⑤'[Number(k) - 1] ?? k}</span>
                          <Latex text={v} className="text-[15px] text-ink" />
                        </button>
                      );
                    })}
                  </div>
                );
              })() : (
                <input
                  type="text"
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && currentAnswered) isLast ? handleSubmit() : goNext(); }}
                  placeholder="답을 입력하세요"
                  autoFocus
                  className="w-full border border-grain rounded-lg px-5 py-3 font-mono text-[16px] text-ink focus:outline-none focus:border-ink transition-colors"
                />
              )}
            </div>

            {/* navigation */}
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={goPrev}
                disabled={currentIdx === 0}
                className="h-11 px-5 rounded-full text-[14px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← 이전
              </button>
              {isLast ? (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || answeredCount === 0}
                  className="h-11 px-6 rounded-full bg-ink text-paper font-medium text-[14px] hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {submitting ? '제출 중...' : '제출하기'}
                </button>
              ) : (
                <button
                  onClick={goNext}
                  className="h-11 px-5 rounded-full bg-ink text-paper font-medium text-[14px] hover:bg-ink-soft transition-colors cursor-pointer"
                >
                  다음 →
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="border border-grain rounded-lg p-8 text-center">
            <p className="text-[14px] text-ink-muted">문제를 불러오는 중...</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
