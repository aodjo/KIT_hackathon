import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import AppLayout from '../components/AppLayout';

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

/** Assignment record */
type Assignment = {
  id: number;
  title: string;
  workbook_id: string | null;
  created_at: string;
};

/** Submission record */
type Submission = {
  student_name: string;
  student_user_id: string;
  answer: string;
  correct: number;
  submitted_at: string;
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
 * Assignment detail page for teachers.
 *
 * @return detail page element
 */
export default function AssignmentDetail() {
  const { id, classId } = useParams<{ id: string; classId: string }>();
  const navigate = useNavigate();

  /** Assignment data */
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  /** Questions for workbook-based assignment */
  const [questions, setQuestions] = useState<Question[]>([]);
  /** Student submissions */
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  /** Active tab */
  const [tab, setTab] = useState<'questions' | 'submissions' | 'analysis'>('questions');
  /** Stuck analyses from Whisper */
  const [analyses, setAnalyses] = useState<{ studentName: string; questionId: number; stuckPoint: string; missingConcepts: string[]; recommendedPractice: string; confidence: number; createdAt: string }[]>([]);

  /** Fetch assignment + submissions */
  useEffect(() => {
    if (!id) return;
    fetch(`${API}/api/assignments/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setAssignment(d.assignment);
        setSubmissions(d.submissions ?? []);
      });
  }, [id]);

  /** Fetch questions if workbook-based */
  useEffect(() => {
    if (!id) return;
    fetch(`${API}/api/assignments/${id}/questions`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []));
  }, [id]);

  /** Fetch hidden questions from Whisper */
  useEffect(() => {
    if (!id) return;
    const load = () => {
      fetch(`${API}/api/whisper/assignment/${id}`)
        .then((r) => r.json())
        .then((d) => setAnalyses(d.analyses ?? []))
        .catch(() => {});
    };

    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [id]);

  if (!assignment) {
    return (
      <AppLayout selectedClassId={classId} initialClassId={classId} onClickClass={(cls) => navigate(`/c/${cls.id}`)}>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[14px] text-ink-muted font-mono">로딩 중...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout selectedClassId={classId} initialClassId={classId} onClickClass={(cls) => navigate(`/c/${cls.id}`)}>
      <div className="flex-1 max-w-4xl w-full px-6 py-10">
        {/* header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(`/c/${classId}`)}
            className="text-ink-muted hover:text-ink transition-colors cursor-pointer text-[14px] mb-4 block"
          >
            ← 돌아가기
          </button>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[28px] text-ink">{assignment.title}</h1>
            {assignment.workbook_id && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-grain text-ink-muted">문제집</span>
            )}
          </div>
          <p className="text-[12px] text-ink-muted font-mono mt-2">
            {new Date(assignment.created_at).toLocaleDateString('ko-KR')} 출제
          </p>
        </div>

        {/* tabs */}
        <div className="flex gap-1 mb-6 bg-grain/30 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('questions')}
            className={`px-4 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer ${tab === 'questions' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
          >
            문제 ({questions.length})
          </button>
          <button
            onClick={() => setTab('submissions')}
            className={`px-4 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer ${tab === 'submissions' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
          >
            제출 ({submissions.length})
          </button>
          <button
            onClick={() => setTab('analysis')}
            className={`px-4 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer ${tab === 'analysis' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
          >
            학습 분석 {analyses.length > 0 && `(${analyses.length})`}
          </button>
        </div>

        {/* content */}
        {tab === 'questions' && (
          questions.length === 0 ? (
            <div className="border border-grain rounded-lg p-8 text-center">
              <p className="text-[14px] text-ink-muted">문제가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {questions.map((q, i) => (
                <div key={q.id} className="border border-grain rounded-lg p-4 bg-paper">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[12px] font-mono font-bold text-ink">{i + 1}.</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[q.difficulty] ?? ''}`}>
                      {q.difficulty}
                    </span>
                    <span className="text-[10px] font-mono text-ink-muted">{q.school_level} &gt; {q.grade} &gt; {q.curriculum_topic}</span>
                  </div>
                  <Latex text={q.question} className="text-[13px] text-ink leading-relaxed block" />
                  {q.type === '객관식' && q.choices && (() => {
                    const parsed = JSON.parse(q.choices) as Record<string, string>;
                    return (
                      <div className="mt-2 space-y-0.5">
                        {Object.entries(parsed).map(([k, v]) => (
                          <div key={k} className="text-[11px] text-ink-muted font-mono">
                            {'①②③④⑤'[Number(k) - 1] ?? k} <Latex text={v} />
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="mt-3 pt-2 border-t border-grain/50">
                    <span className="text-[10px] font-mono text-ink-muted">정답: </span>
                    <Latex text={(() => {
                      try {
                        const parsed = JSON.parse(q.answer);
                        if (Array.isArray(parsed)) return parsed.join(', ');
                      } catch { /* not JSON */ }
                      return q.answer;
                    })()} className="text-[11px] font-mono text-emerald-600" />
                  </div>
                </div>
              ))}
            </div>
          )
        )}
        {tab === 'submissions' && (
          submissions.length === 0 ? (
            <div className="border border-grain rounded-lg p-8 text-center">
              <p className="text-[14px] text-ink-muted">아직 제출한 학생이 없습니다.</p>
            </div>
          ) : (
            <div className="border border-grain rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-grain bg-grain/20">
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">학생</th>
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">결과</th>
                    <th className="text-left px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">제출 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s, i) => (
                    <tr key={i} className="border-b border-grain/50 last:border-b-0">
                      <td className="px-4 py-3 text-[14px] text-ink">{s.student_name}</td>
                      <td className="px-4 py-3">
                        {s.correct ? (
                          <span className="text-[12px] font-mono text-emerald-600 px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50">{s.answer}</span>
                        ) : (
                          <span className="text-[12px] font-mono text-red-500 px-2 py-0.5 rounded border border-red-200 bg-red-50">{s.answer}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-ink-muted font-mono">
                        {new Date(s.submitted_at).toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        {tab === 'analysis' && (
          analyses.length === 0 ? (
            <div className="border border-grain rounded-lg p-8 text-center">
              <p className="text-[14px] text-ink-muted">아직 분석된 데이터가 없습니다.</p>
              <p className="text-[12px] text-ink-muted mt-1">학생들이 문제를 풀면서 막히는 순간이 감지되면 AI가 분석합니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {analyses.map((a, i) => (
                <div key={i} className="border border-grain rounded-lg p-5 bg-paper">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-ink">{a.studentName}</span>
                      <span className="text-[10px] font-mono text-ink-muted">문제 {questions.findIndex((q) => q.id === a.questionId) + 1}</span>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      a.confidence > 0.7 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
                    }`}>
                      {Math.round(a.confidence * 100)}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">막힌 지점</span>
                      <p className="text-[14px] text-ink mt-1">{a.stuckPoint}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">부족한 개념</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {a.missingConcepts.map((c, j) => (
                          <span key={j} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">{c}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">추천 연습</span>
                      <p className="text-[14px] text-ink mt-1">{a.recommendedPractice}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
}
