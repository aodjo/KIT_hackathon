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
 * Student assignment solve page.
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
  /** Submission result */
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null);
  /** Submitting state */
  const [submitting, setSubmitting] = useState(false);
  /** Already submitted */
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  /** Fetch assignment info */
  useEffect(() => {
    if (!id) return;
    fetch(`${API}/api/assignments/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setTitle(d.assignment?.title ?? '');
        if (d.submissions && user) {
          const mine = d.submissions.find((s: any) => s.student_id === user.id);
          if (mine) setAlreadySubmitted(true);
        }
      });
  }, [id]);

  /** Fetch questions */
  useEffect(() => {
    if (!id) return;
    fetch(`${API}/api/assignments/${id}/questions`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []));
  }, [id]);

  /**
   * Update answer for a question.
   *
   * @param qId question ID
   * @param value answer text
   * @return void
   */
  const setAnswer = (qId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
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
      setAlreadySubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  /** Answered count */
  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length;

  if (!user) return null;

  return (
    <AppLayout
      selectedClassId={classId}
      initialClassId={classId}
      onClickClass={(cls) => navigate(`/c/${cls.id}`)}
    >
      <div className="flex-1 max-w-4xl w-full px-6 py-10">
        {/* header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(`/c/${classId}`)}
            className="text-ink-muted hover:text-ink transition-colors cursor-pointer text-[14px] mb-4 block"
          >
            ← 돌아가기
          </button>
          <h1 className="font-display text-[28px] text-ink">{title}</h1>
          <p className="text-[12px] text-ink-muted font-mono mt-2">
            {answeredCount}/{questions.length}문제 작성
          </p>
        </div>

        {/* result banner */}
        {result && (
          <div className={`rounded-lg p-5 mb-6 border ${
            result.correct === result.total
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <p className="text-[16px] font-medium text-ink">
              {result.correct === result.total
                ? '모두 정답입니다!'
                : `${result.total}문제 중 ${result.correct}문제 정답`}
            </p>
          </div>
        )}

        {/* questions */}
        {questions.length === 0 ? (
          <div className="border border-grain rounded-lg p-8 text-center">
            <p className="text-[14px] text-ink-muted">문제가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, i) => (
              <div key={q.id} className="border border-grain rounded-lg p-5 bg-paper">
                {/* question header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[13px] font-mono font-bold text-ink">{i + 1}.</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[q.difficulty] ?? ''}`}>
                    {q.difficulty}
                  </span>
                  <span className="text-[10px] font-mono text-ink-muted">{q.type}</span>
                </div>

                {/* question text */}
                <Latex text={q.question} className="text-[15px] text-ink leading-relaxed block mb-4" />

                {/* answer input */}
                {q.type === '객관식' && q.choices ? (() => {
                  const parsed = JSON.parse(q.choices) as Record<string, string>;
                  return (
                    <div className="space-y-2">
                      {Object.entries(parsed).map(([k, v]) => {
                        const selected = answers[q.id] === k;
                        return (
                          <button
                            key={k}
                            onClick={() => !result && setAnswer(q.id, k)}
                            disabled={!!result}
                            className={`w-full text-left px-4 py-2.5 rounded-lg border transition-colors ${
                              result
                                ? k === q.answer
                                  ? 'border-emerald-400 bg-emerald-50'
                                  : selected && k !== q.answer
                                    ? 'border-red-400 bg-red-50'
                                    : 'border-grain'
                                : selected
                                  ? 'border-ink bg-ink/5'
                                  : 'border-grain hover:border-ink/30 cursor-pointer'
                            }`}
                          >
                            <span className="text-[13px] font-mono text-ink-muted mr-2">{'①②③④⑤'[Number(k) - 1] ?? k}</span>
                            <Latex text={v} className="text-[14px] text-ink" />
                          </button>
                        );
                      })}
                    </div>
                  );
                })() : (
                  <div>
                    <input
                      type="text"
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      disabled={!!result}
                      placeholder="답을 입력하세요"
                      className="w-full border border-grain rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors disabled:bg-grain/30"
                    />
                    {result && (
                      <p className="mt-2 text-[12px] font-mono">
                        <span className="text-ink-muted">정답: </span>
                        <Latex text={(() => {
                          try {
                            const parsed = JSON.parse(q.answer);
                            if (Array.isArray(parsed)) return parsed.join(', ');
                          } catch { /* not JSON */ }
                          return q.answer;
                        })()} className="text-emerald-600" />
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* submit button */}
        {questions.length > 0 && !result && (
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting || answeredCount === 0}
              className="h-11 px-6 rounded-full bg-ink text-paper font-medium text-[14px] hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {submitting ? '제출 중...' : alreadySubmitted ? '다시 제출' : '제출하기'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
