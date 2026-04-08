import { useState, useEffect, useRef, useCallback } from 'react';
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

/** Single stroke point */
type Point = { x: number; y: number };

/** Stroke data */
type Stroke = { points: Point[]; color: string; width: number };

/**
 * Vector-based canvas with zoom, pan, undo.
 *
 * @param props.strokes saved strokes
 * @param props.onSave callback when strokes change
 * @return canvas element
 */
function DrawCanvas({ strokes: savedStrokes, onSave }: { strokes?: Stroke[]; onSave: (strokes: Stroke[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /** All committed strokes */
  const strokes = useRef<Stroke[]>(savedStrokes ?? []);
  /** Current in-progress stroke */
  const current = useRef<Stroke | null>(null);
  /** Undo stack */
  const undoStack = useRef<Stroke[][]>([]);
  /** Redo stack */
  const redoStack = useRef<Stroke[][]>([]);

  /** View transform */
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  /** Active tool */
  const [tool, setTool] = useState<'pen' | 'eraser' | 'pan'>('pen');
  /** Pen width */
  const [penSize, setPenSize] = useState(2);
  /** Undo/redo count for re-render trigger */
  const [revision, setRevision] = useState(0);

  /** Drawing state refs */
  const isDown = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  /**
   * Convert screen coords to world coords.
   *
   * @param e pointer event
   * @return world-space point
   */
  const toWorld = useCallback((e: React.PointerEvent): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - offset.x) / scale,
      y: (e.clientY - rect.top - offset.y) / scale,
    };
  }, [scale, offset]);

  /**
   * Render all strokes to canvas.
   *
   * @return void
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    /** Clear */
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    /** Draw grid when zoomed */
    if (scale > 1.2) {
      const gridSize = 20;
      ctx.strokeStyle = '#f0ede8';
      ctx.lineWidth = 0.5 / scale;
      const startX = Math.floor(-offset.x / scale / gridSize) * gridSize;
      const startY = Math.floor(-offset.y / scale / gridSize) * gridSize;
      const endX = startX + w / scale + gridSize;
      const endY = startY + h / scale + gridSize;
      for (let x = startX; x < endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
      }
      for (let y = startY; y < endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
      }
    }

    /** Draw strokes */
    const all = [...strokes.current];
    if (current.current) all.push(current.current);
    for (const s of all) {
      if (s.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        const p0 = s.points[i - 1];
        const p1 = s.points[i];
        ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    ctx.restore();
  }, [scale, offset, revision]);

  /** Re-render on state change */
  useEffect(() => { render(); }, [render]);

  /** Resize observer */
  useEffect(() => {
    const obs = new ResizeObserver(() => render());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [render]);

  /** Pointer down */
  const onDown = (e: React.PointerEvent) => {
    isDown.current = true;
    containerRef.current?.setPointerCapture(e.pointerId);

    if (tool === 'pan') {
      panStart.current = { x: e.clientX, y: e.clientY };
      offsetStart.current = { ...offset };
      return;
    }

    undoStack.current.push([...strokes.current]);
    redoStack.current = [];
    current.current = {
      points: [toWorld(e)],
      color: tool === 'eraser' ? '#ffffff' : '#1a1a1a',
      width: tool === 'eraser' ? penSize * 5 : penSize,
    };
  };

  /** Pointer move */
  const onMove = (e: React.PointerEvent) => {
    if (!isDown.current) return;

    if (tool === 'pan') {
      setOffset({
        x: offsetStart.current.x + (e.clientX - panStart.current.x),
        y: offsetStart.current.y + (e.clientY - panStart.current.y),
      });
      return;
    }

    if (current.current) {
      current.current.points.push(toWorld(e));
      render();
    }
  };

  /** Pointer up */
  const onUp = () => {
    isDown.current = false;
    if (current.current && current.current.points.length >= 2) {
      strokes.current.push(current.current);
      onSave(strokes.current);
    }
    current.current = null;
    setRevision((r) => r + 1);
  };

  /** Undo */
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push([...strokes.current]);
    strokes.current = prev;
    onSave(strokes.current);
    setRevision((r) => r + 1);
  };

  /** Redo */
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push([...strokes.current]);
    strokes.current = next;
    onSave(strokes.current);
    setRevision((r) => r + 1);
  };

  /** Clear all */
  const clear = () => {
    undoStack.current.push([...strokes.current]);
    redoStack.current = [];
    strokes.current = [];
    onSave([]);
    setRevision((r) => r + 1);
  };

  /** Zoom */
  const zoom = (dir: 1 | -1) => {
    setScale((s) => Math.min(4, Math.max(0.5, s + dir * 0.25)));
  };

  /** Reset view */
  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  /** Scroll to zoom */
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    setScale((s) => Math.min(4, Math.max(0.5, s + dir * 0.1)));
  };

  /** Tool button helper */
  const ToolBtn = ({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) => (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
        active ? 'bg-ink text-paper' : 'text-ink-muted hover:text-ink hover:bg-grain/50'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div>
      {/* toolbar */}
      <div className="flex items-center gap-1 mb-2 px-1">
        {/* drawing tools */}
        <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')} title="펜">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </ToolBtn>
        <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} title="지우개">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />
          </svg>
        </ToolBtn>
        <ToolBtn active={tool === 'pan'} onClick={() => setTool('pan')} title="이동">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M15 19l-3 3-3-3" /><path d="M19 9l3 3-3 3" /><path d="M2 12h20" /><path d="M12 2v20" />
          </svg>
        </ToolBtn>

        {/* separator */}
        <div className="w-px h-5 bg-grain mx-1" />

        {/* pen size */}
        <div className="flex items-center gap-1.5 mx-1">
          {[1, 2, 4, 6].map((s) => (
            <button
              key={s}
              onClick={() => setPenSize(s)}
              title={`${s}px`}
              className={`rounded-full transition-colors cursor-pointer ${
                penSize === s ? 'bg-ink' : 'bg-ink/30 hover:bg-ink/60'
              }`}
              style={{ width: Math.max(6, s * 2 + 4), height: Math.max(6, s * 2 + 4) }}
            />
          ))}
        </div>

        {/* separator */}
        <div className="w-px h-5 bg-grain mx-1" />

        {/* undo/redo */}
        <ToolBtn onClick={undo} title="실행 취소">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </ToolBtn>
        <ToolBtn onClick={redo} title="다시 실행">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
        </ToolBtn>
        <ToolBtn onClick={clear} title="전체 지우기">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </ToolBtn>

        {/* separator */}
        <div className="w-px h-5 bg-grain mx-1" />

        {/* zoom */}
        <ToolBtn onClick={() => zoom(-1)} title="축소">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M8 11h6" />
          </svg>
        </ToolBtn>
        <button onClick={resetView} title="초기화" className="text-[10px] font-mono text-ink-muted hover:text-ink cursor-pointer min-w-[36px] text-center">
          {Math.round(scale * 100)}%
        </button>
        <ToolBtn onClick={() => zoom(1)} title="확대">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6" /><path d="M8 11h6" />
          </svg>
        </ToolBtn>
      </div>

      {/* canvas */}
      <div
        ref={containerRef}
        onWheel={onWheel}
        className="relative overflow-hidden border border-grain rounded-lg bg-white"
        style={{ height: 240 }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className={`absolute inset-0 touch-none ${
            tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'
          }`}
        />
      </div>
    </div>
  );
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
  /** Work/solution mode per question ('draw' or 'type') */
  const [workMode, setWorkMode] = useState<'draw' | 'type'>('draw');
  /** Typed work keyed by question ID */
  const [workText, setWorkText] = useState<Record<number, string>>({});
  /** Canvas strokes keyed by question ID */
  const [workDraw, setWorkDraw] = useState<Record<number, Stroke[]>>({});
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

              {/* work/solution section */}
              <div className="mt-6 pt-5 border-t border-grain">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">풀이과정</span>
                  <div className="flex gap-1 bg-grain/30 rounded-lg p-0.5">
                    <button
                      onClick={() => setWorkMode('draw')}
                      className={`text-[11px] font-mono px-3 py-1 rounded-md transition-colors cursor-pointer ${
                        workMode === 'draw' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      필기
                    </button>
                    <button
                      onClick={() => setWorkMode('type')}
                      className={`text-[11px] font-mono px-3 py-1 rounded-md transition-colors cursor-pointer ${
                        workMode === 'type' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      타이핑
                    </button>
                  </div>
                </div>
                {workMode === 'draw' ? (
                  <DrawCanvas
                    key={q.id}
                    strokes={workDraw[q.id]}
                    onSave={(s) => setWorkDraw((prev) => ({ ...prev, [q.id]: s }))}
                  />
                ) : (
                  <textarea
                    value={workText[q.id] ?? ''}
                    onChange={(e) => setWorkText((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="풀이과정을 입력하세요..."
                    rows={5}
                    className="w-full border border-grain rounded-lg px-4 py-3 font-mono text-[14px] text-ink resize-none focus:outline-none focus:border-ink transition-colors"
                  />
                )}
              </div>
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
