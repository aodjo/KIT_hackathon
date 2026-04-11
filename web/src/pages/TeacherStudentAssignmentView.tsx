import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { getStoredUser } from '../lib/auth';
import { DrawCanvas, Latex, type Stroke } from './StudentAssignment';

/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

type Question = {
  id: number;
  concept_id: string;
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

type SnapshotResponse = {
  assignment: {
    id: number;
    class_id: string;
    title: string;
    workbook_id: string | null;
  };
  student: {
    id: number;
    name: string;
    user_id: string;
  };
  questions: Question[];
  snapshot: {
    currentIdx: number;
    answers: Record<number, string>;
    workDraw: Record<number, Stroke[]>;
    attempts: Record<number, number>;
    results: Record<number, boolean>;
    chatMessages: Record<number, { role: 'ai' | 'student'; content: string }[]>;
    advanceApproved: Record<number, boolean>;
    teacherHelpRequested: Record<number, boolean>;
    finalResult: { correct: number; total: number } | null;
    submissionStatus: 'submitted' | 'progress' | null;
    submittedAt: string | null;
  };
};

/** Difficulty badge color */
const diffColor: Record<string, string> = {
  '상': 'text-red-500 border-red-200',
  '중': 'text-amber-600 border-amber-200',
  '하': 'text-emerald-600 border-emerald-200',
};

export default function TeacherStudentAssignmentView() {
  const { classId, id, studentId } = useParams<{ classId: string; id: string; studentId: string }>();
  const navigate = useNavigate();
  const user = getStoredUser();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentUserId, setStudentUserId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [workDraw, setWorkDraw] = useState<Record<number, Stroke[]>>({});
  const [attempts, setAttempts] = useState<Record<number, number>>({});
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [chatMessages, setChatMessages] = useState<Record<number, { role: 'ai' | 'student'; content: string }[]>>({});
  const [advanceApproved, setAdvanceApproved] = useState<Record<number, boolean>>({});
  const [teacherHelpRequested, setTeacherHelpRequested] = useState<Record<number, boolean>>({});
  const [finalResult, setFinalResult] = useState<{ correct: number; total: number } | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<'submitted' | 'progress' | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsVisible, setFsVisible] = useState(false);
  const [canvasTool, setCanvasTool] = useState<'pen' | 'eraser' | 'pan'>('pan');
  const [canvasPenSize, setCanvasPenSize] = useState(2);

  useEffect(() => {
    if (!id || !studentId) return;
    setLoading(true);
    fetch(`${API}/api/assignments/${id}/student-view/${studentId}`)
      .then((response) => response.json())
      .then((data: SnapshotResponse) => {
        setTitle(data.assignment?.title ?? '');
        setStudentName(data.student?.name ?? '');
        setStudentUserId(data.student?.user_id ?? '');
        setQuestions(data.questions ?? []);
        setAnswers(data.snapshot?.answers ?? {});
        setWorkDraw(data.snapshot?.workDraw ?? {});
        setAttempts(data.snapshot?.attempts ?? {});
        setResults(data.snapshot?.results ?? {});
        setChatMessages(data.snapshot?.chatMessages ?? {});
        setAdvanceApproved(data.snapshot?.advanceApproved ?? {});
        setTeacherHelpRequested(data.snapshot?.teacherHelpRequested ?? {});
        setFinalResult(data.snapshot?.finalResult ?? null);
        setSubmissionStatus(data.snapshot?.submissionStatus ?? null);
        setSubmittedAt(data.snapshot?.submittedAt ?? null);
        setCurrentIdx(typeof data.snapshot?.currentIdx === 'number' ? data.snapshot.currentIdx : 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, studentId]);

  useEffect(() => {
    if (questions.length === 0) return;
    setCurrentIdx((prev) => Math.max(0, Math.min(prev, questions.length - 1)));
  }, [questions.length]);

  const openFullscreen = () => {
    setFullscreen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setFsVisible(true)));
  };

  const closeFullscreen = () => {
    setFsVisible(false);
    setTimeout(() => setFullscreen(false), 300);
  };

  const goPrev = () => setCurrentIdx((prev) => Math.max(0, prev - 1));
  const goNext = () => setCurrentIdx((prev) => Math.min(questions.length - 1, prev + 1));

  const q = questions[currentIdx];
  const answeredCount = questions.filter((question) => (answers[question.id] ?? '').trim()).length;
  const currentCorrect = q ? !!results[q.id] : false;
  const currentTeacherHelp = q ? !!teacherHelpRequested[q.id] : false;
  const currentApproved = q ? !!advanceApproved[q.id] || !!teacherHelpRequested[q.id] : false;
  const currentAttemptCount = q ? attempts[q.id] ?? 0 : 0;
  const currentMessages = q ? chatMessages[q.id] ?? [] : [];
  const statusLabel = submissionStatus === 'submitted'
    ? '최종 제출'
    : submissionStatus === 'progress'
      ? '부분 제출'
      : '열람';

  if (!user) return null;

  return (
    <AppLayout
      selectedClassId={classId}
      initialClassId={classId}
      onClickClass={(cls) => navigate(`/c/${cls.id}`)}
    >
      <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-6 py-10">
        <div className="mb-8">
          <button
            onClick={() => navigate(`/c/${classId}/a/${id}`)}
            className="text-ink-muted hover:text-ink transition-colors cursor-pointer text-[14px] mb-4 block"
          >
            ← 돌아가기
          </button>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="font-display text-[28px] text-ink">{title}</h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-grain bg-grain/20 text-ink-muted">
              {statusLabel}
            </span>
          </div>
          <p className="text-[14px] text-ink">
            {studentUserId ? `${studentName} (ID: ${studentUserId})` : studentName}
          </p>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[12px] text-ink-muted font-mono">
              {answeredCount}/{questions.length}문제 작성
            </p>
            {submittedAt && (
              <p className="text-[12px] text-ink-muted font-mono">
                {new Date(submittedAt).toLocaleString('ko-KR')}
              </p>
            )}
          </div>
          {finalResult && (
            <p className="mt-2 text-[12px] text-ink-muted font-mono">
              최종 결과 {finalResult.correct}/{finalResult.total}
            </p>
          )}
          {questions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {questions.map((question, index) => {
                const isCurrent = index === currentIdx;
                const isCorrect = !!results[question.id];
                const isTeacherHelp = !!teacherHelpRequested[question.id];
                const attemptCount = attempts[question.id] ?? 0;
                const hasAnswer = !!answers[question.id]?.trim();

                return (
                  <button
                    key={question.id}
                    onClick={() => setCurrentIdx(index)}
                    className={`w-7 h-7 rounded-full text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-ink text-paper'
                        : isTeacherHelp
                          ? 'bg-amber-500 text-paper'
                          : isCorrect && attemptCount > 0
                            ? 'bg-amber-400 text-paper'
                            : isCorrect
                              ? 'bg-emerald-500 text-paper'
                              : attemptCount > 0
                                ? 'bg-red-400 text-paper'
                                : hasAnswer
                                  ? 'bg-ink/20 text-ink'
                                  : 'bg-grain/50 text-ink-muted'
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {loading ? (
          <div className="border border-grain rounded-lg p-8 text-center">
            <p className="text-[14px] text-ink-muted">학생 풀이를 불러오는 중...</p>
          </div>
        ) : q ? (
          <div className="flex-1 flex flex-col">
            <div className="border border-grain rounded-lg p-8 bg-paper flex-1">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-[14px] font-mono font-bold text-ink">{currentIdx + 1}.</span>
                {q.difficulty && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[q.difficulty] ?? ''}`}>
                    {q.difficulty}
                  </span>
                )}
                {(q.school_level || q.grade || q.curriculum_topic) && (
                  <span className="text-[10px] font-mono text-ink-muted">
                    {q.school_level} {q.grade ? `> ${q.grade}` : ''} {q.curriculum_topic ? `> ${q.curriculum_topic}` : ''}
                  </span>
                )}
              </div>

              <Latex text={q.question} className="text-[18px] text-ink leading-relaxed block mb-6" />

              {q.type === '객관식' && q.choices ? (() => {
                const parsed = JSON.parse(q.choices) as Record<string, string>;
                return (
                  <div className="space-y-2">
                    {Object.entries(parsed).map(([key, value]) => {
                      const selected = answers[q.id] === key;
                      return (
                        <div
                          key={key}
                          className={`w-full text-left px-5 py-3 rounded-lg border ${
                            selected ? 'border-ink bg-ink/5' : 'border-grain'
                          }`}
                        >
                          <span className="text-[14px] font-mono text-ink-muted mr-3">{'①②③④⑤'[Number(key) - 1] ?? key}</span>
                          <Latex text={value} className="text-[15px] text-ink" />
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <input
                  type="text"
                  value={answers[q.id] ?? ''}
                  readOnly
                  disabled
                  className="w-full border border-grain rounded-lg px-5 py-3 font-mono text-[16px] text-ink bg-grain/20"
                />
              )}

              <div className="mt-6 pt-5 border-t border-grain">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">풀이과정</span>
                </div>
                {fullscreen ? (
                  <div className="border border-dashed border-grain rounded-lg h-[60px] flex items-center justify-center">
                    <span className="text-[12px] text-ink-muted">최대화 모드에서 열람 중</span>
                  </div>
                ) : (
                  <DrawCanvas
                    key={q.id}
                    strokes={workDraw[q.id]}
                    onSave={() => {}}
                    height={240}
                    tool={canvasTool}
                    setTool={setCanvasTool}
                    penSize={canvasPenSize}
                    setPenSize={setCanvasPenSize}
                    onExpand={openFullscreen}
                    readOnly
                  />
                )}
              </div>
            </div>

            {currentTeacherHelp ? (
              <div className="mt-6 border-t border-grain pt-6">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[15px] font-medium text-ink">선생님 도움 요청으로 이 문제가 보류되었습니다.</p>
                  <p className="mt-1 text-[13px] text-amber-800">학생이 현재 문제를 스스로 이어가기 어려워 도움 요청을 남긴 상태입니다.</p>
                </div>
              </div>
            ) : currentCorrect ? (
              <div className="mt-6 border-t border-grain pt-6">
                <div className="rounded-lg p-4 bg-emerald-50 border border-emerald-200">
                  <p className="text-[15px] font-medium text-ink">정답입니다.</p>
                  <p className="mt-1 text-[13px] text-emerald-800">
                    {currentApproved ? '설명 단계까지 완료된 문제입니다.' : '정답을 맞힌 뒤 설명 대화를 진행한 문제입니다.'}
                  </p>
                </div>
              </div>
            ) : currentAttemptCount > 0 ? (
              <div className="mt-6 border-t border-grain pt-6">
                <div className="rounded-lg p-4 bg-red-50 border border-red-200">
                  <p className="text-[15px] font-medium text-ink">오답입니다.</p>
                  <p className="mt-1 text-[13px] text-red-700">{currentAttemptCount}회 시도한 기록이 있습니다.</p>
                </div>
              </div>
            ) : null}

            {currentMessages.length > 0 && (
              <div className="mt-6 border-t border-grain pt-6">
                <div className="mb-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">설명 대화</span>
                </div>
                <div className="space-y-4">
                  {currentMessages.map((message, index) => (
                    <div key={index} className="flex flex-col gap-1">
                      <span className={`text-[10px] uppercase tracking-[0.14em] font-mono font-medium ${message.role === 'ai' ? 'text-clay-deep' : 'text-ink'}`}>
                        {message.role === 'ai' ? '과거의 나' : '나'}
                      </span>
                      <p className={`text-[15px] leading-relaxed ${message.role === 'ai' ? 'text-ink-muted' : 'text-ink'}`}>
                        {message.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-6">
              <button
                onClick={goPrev}
                disabled={currentIdx === 0}
                className="h-11 px-5 rounded-full text-[14px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← 이전
              </button>
              <button
                onClick={goNext}
                disabled={currentIdx === questions.length - 1}
                className="h-11 px-5 rounded-full bg-ink text-paper font-medium text-[14px] hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                다음 문제 →
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-grain rounded-lg p-8 text-center">
            <p className="text-[14px] text-ink-muted">열람할 문제 정보가 없습니다.</p>
          </div>
        )}
      </div>

      {fullscreen && q && (
        <div className={`fixed inset-0 z-50 bg-paper flex transition-all duration-300 ease-in-out ${
          fsVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`} style={{ transformOrigin: 'center bottom' }}>
          <div className="w-96 shrink-0 border-r border-grain overflow-y-auto p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[14px] font-mono font-bold text-ink">{currentIdx + 1}.</span>
              {q.difficulty && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[q.difficulty] ?? ''}`}>
                  {q.difficulty}
                </span>
              )}
              <span className="text-[10px] font-mono text-ink-muted">{q.type}</span>
            </div>
            <Latex text={q.question} className="text-[16px] text-ink leading-relaxed block mb-6" />
            {q.type === '객관식' && q.choices && (() => {
              const parsed = JSON.parse(q.choices) as Record<string, string>;
              return (
                <div className="space-y-2">
                  {Object.entries(parsed).map(([key, value]) => (
                    <div key={key} className="text-[13px] text-ink-muted font-mono">
                      {'①②③④⑤'[Number(key) - 1] ?? key} <Latex text={value} />
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="mt-6 pt-4 border-t border-grain">
              <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono block mb-2">답</span>
              {q.type === '객관식' && q.choices ? (() => {
                const parsed = JSON.parse(q.choices) as Record<string, string>;
                return (
                  <div className="space-y-1.5">
                    {Object.entries(parsed).map(([key, value]) => {
                      const selected = answers[q.id] === key;
                      return (
                        <div
                          key={key}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-[13px] ${
                            selected ? 'border-ink bg-ink/5' : 'border-grain'
                          }`}
                        >
                          <span className="font-mono text-ink-muted mr-2">{'①②③④⑤'[Number(key) - 1] ?? key}</span>
                          <Latex text={value} className="text-ink" />
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <input
                  type="text"
                  value={answers[q.id] ?? ''}
                  readOnly
                  disabled
                  className="w-full border border-grain rounded-lg px-4 py-2.5 font-mono text-[14px] text-ink bg-grain/20"
                />
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="flex-1 p-4 overflow-hidden min-h-0">
              <DrawCanvas
                key={q.id}
                strokes={workDraw[q.id]}
                onSave={() => {}}
                tool={canvasTool}
                setTool={setCanvasTool}
                penSize={canvasPenSize}
                setPenSize={setCanvasPenSize}
                onCollapse={closeFullscreen}
                readOnly
              />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
