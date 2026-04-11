import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import AppLayout from '../components/AppLayout';
import { getStoredUser } from '../lib/auth';
import {
  fetchQuestionCurriculumMap,
  type QuestionCurriculumSnapshot,
} from '../lib/curriculumApi';

/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

/** Question record */
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
 * MathLive-based math editor.
 *
 * @param props.value LaTeX string
 * @param props.onChange change handler
 * @param props.className optional container class
 * @return math editor element
 */
/** Math toolbar tab definitions */
const mathTabs = [
  { id: 'basic', label: '기본', symbols: [
    { latex: '+', display: '+' }, { latex: '-', display: '−' }, { latex: '\\times', display: '×' }, { latex: '\\div', display: '÷' },
    { latex: '=', display: '=' }, { latex: '\\neq', display: '≠' }, { latex: '<', display: '<' }, { latex: '>', display: '>' },
    { latex: '\\leq', display: '≤' }, { latex: '\\geq', display: '≥' }, { latex: '\\pm', display: '±' }, { latex: '\\infty', display: '∞' },
  ]},
  { id: 'frac', label: '분수·지수', symbols: [
    { latex: '\\frac{}{}', display: '⬚/⬚', struct: 'frac' },
    { latex: '\\sqrt{}', display: '√⬚', struct: 'sqrt' },
    { latex: 'x^{}', display: 'xⁿ', struct: 'sup' },
    { latex: 'x_{}', display: 'x₋', struct: 'sub' },
    { latex: '\\log', display: 'log' }, { latex: '\\ln', display: 'ln' },
  ]},
  { id: 'geo', label: '도형', symbols: [
    { latex: '\\angle', display: '∠' }, { latex: '\\triangle', display: '△' }, { latex: '\\square', display: '□' },
    { latex: '\\parallel', display: '∥' }, { latex: '\\perp', display: '⊥' }, { latex: '^\\circ', display: '°' },
    { latex: '\\overline{}', display: 'AB̅', struct: 'overline' },
    { latex: '\\text{cm}^2', display: 'cm²' }, { latex: '\\text{cm}', display: 'cm' },
  ]},
  { id: 'greek', label: '그리스', symbols: [
    { latex: '\\pi', display: 'π' }, { latex: '\\theta', display: 'θ' }, { latex: '\\alpha', display: 'α' }, { latex: '\\beta', display: 'β' },
    { latex: '\\gamma', display: 'γ' }, { latex: '\\delta', display: 'δ' }, { latex: '\\sigma', display: 'σ' }, { latex: '\\omega', display: 'ω' },
  ]},
];

/** Symbol definition */
type MathSym = { latex: string; display: string; struct?: string };

/**
 * Extract LaTeX from a math structure element.
 *
 * @param el structure element
 * @return LaTeX string
 */
function structToLatex(el: HTMLElement): string {
  const type = el.dataset.mathType;
  const slots = Array.from(el.querySelectorAll('[data-slot]')).map(s => s.textContent?.trim() || '');
  if (type === 'frac') return `\\frac{${slots[0]}}{${slots[1]}}`;
  if (type === 'sqrt') return `\\sqrt{${slots[0]}}`;
  if (type === 'sup') return `${slots[0]}^{${slots[1]}}`;
  if (type === 'sub') return `${slots[0]}_{${slots[1]}}`;
  if (type === 'overline') return `\\overline{${slots[0]}}`;
  return '';
}

/** CSS for editable slot */
const slotCss = 'min-width:14px;padding:0 3px;outline:none;text-align:center;display:inline-block;';

function MathEditor({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const skipSync = useRef(false);
  const [activeTab, setActiveTab] = useState('basic');

  /** Render value to HTML (structs stay editable, not KaTeX) */
  const toHTML = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\$\\frac\{([^}]*)\}\{([^}]*)\}\$/g, (_,a,b) =>
        `<span data-math-type="frac" contenteditable="false" style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin:0 3px;"><span data-slot contenteditable="true" style="${slotCss}border-bottom:1.5px solid #333;">${a}</span><span data-slot contenteditable="true" style="${slotCss}">${b}</span></span>`)
      .replace(/\$\\sqrt\{([^}]*)\}\$/g, (_,a) =>
        `<span data-math-type="sqrt" contenteditable="false" style="display:inline-flex;align-items:center;vertical-align:middle;margin:0 2px;"><span style="font-size:18px">√</span><span data-slot contenteditable="true" style="${slotCss}border-top:1.5px solid #333;">${a}</span></span>`)
      .replace(/\$([^${}]+)\^?\{([^}]*)\}\$/g, (_,a,b) => {
        if (_.includes('^')) return `<span data-math-type="sup" contenteditable="false" style="display:inline-flex;align-items:flex-start;vertical-align:middle;margin:0 1px;"><span data-slot contenteditable="true" style="${slotCss}">${a.replace('$','')}</span><span data-slot contenteditable="true" style="${slotCss}font-size:11px;margin-top:-4px;">${b}</span></span>`;
        return _;
      })
      .replace(/\$([^$]+)\$/g, (_, tex: string) => {
        try {
          return `<span contenteditable="false" data-math="${encodeURIComponent(tex)}" style="display:inline-block;vertical-align:middle;margin:0 2px;padding:2px 4px;border-radius:4px;background:rgba(232,230,223,0.3)">${katex.renderToString(tex, { throwOnError: false })}</span>`;
        } catch { return tex; }
      })
      .replace(/\n/g, '<br>');
  };

  /** Extract value from DOM */
  const fromDOM = (): string => {
    const el = editorRef.current;
    if (!el) return '';
    let r = '';
    const walk = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) r += n.textContent ?? '';
      else if (n instanceof HTMLElement) {
        if (n.dataset.mathType) r += `$${structToLatex(n)}$`;
        else if (n.dataset.math) r += `$${decodeURIComponent(n.dataset.math)}$`;
        else if (n.tagName === 'BR') r += '\n';
        else n.childNodes.forEach(walk);
      }
    };
    el.childNodes.forEach(walk);
    return r;
  };

  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return; }
    if (editorRef.current) editorRef.current.innerHTML = toHTML(value) || '<br>';
  }, [value]);

  const sync = () => { skipSync.current = true; onChange(fromDOM()); };

  /** Insert node at cursor */
  const ins = (node: Node) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
    } else el.appendChild(node);
  };

  /** Build and insert always-editable struct */
  const insertStruct = (type: string) => {
    const w = document.createElement('span');
    w.dataset.mathType = type;
    w.contentEditable = 'false';
    const slot = (ph: string, extra = '') => {
      const s = document.createElement('span');
      s.dataset.slot = 'true';
      s.contentEditable = 'true';
      s.style.cssText = slotCss + extra;
      s.textContent = '';
      s.setAttribute('placeholder', ph);
      return s;
    };
    if (type === 'frac') {
      w.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin:0 3px;';
      w.appendChild(slot('⬚', 'border-bottom:1.5px solid #333;'));
      w.appendChild(slot('⬚'));
    } else if (type === 'sqrt') {
      w.style.cssText = 'display:inline-block;vertical-align:middle;margin:0 2px;border-top:1.5px solid #333;padding-left:2px;padding-right:3px;';
      w.innerHTML = '√';
      w.style.fontStyle = 'normal';
      const inner = slot('⬚');
      inner.style.cssText = slotCss;
      w.textContent = '';
      w.insertAdjacentText('afterbegin', '√');
      w.appendChild(inner);
    } else if (type === 'sup') {
      w.style.cssText = 'display:inline-flex;align-items:flex-start;vertical-align:middle;margin:0 1px;';
      w.appendChild(slot('x'));
      w.appendChild(slot('n', 'font-size:11px;margin-top:-4px;'));
    } else if (type === 'sub') {
      w.style.cssText = 'display:inline-flex;align-items:flex-end;vertical-align:middle;margin:0 1px;';
      w.appendChild(slot('x'));
      w.appendChild(slot('i', 'font-size:11px;margin-bottom:-2px;'));
    } else if (type === 'overline') {
      w.style.cssText = 'display:inline-flex;vertical-align:middle;margin:0 2px;';
      w.appendChild(slot('AB', 'border-top:1.5px solid #333;'));
    }
    ins(w);
    const first = w.querySelector('[data-slot]') as HTMLElement;
    if (first) requestAnimationFrame(() => first.focus());
    sync();
  };

  /** Insert simple rendered symbol */
  const insertSimple = (latex: string) => {
    const span = document.createElement('span');
    span.contentEditable = 'false';
    span.dataset.math = encodeURIComponent(latex);
    span.style.cssText = 'display:inline-block;vertical-align:middle;margin:0 2px;padding:2px 4px;border-radius:4px;background:rgba(232,230,223,0.3)';
    try { span.innerHTML = katex.renderToString(latex, { throwOnError: false }); } catch { span.textContent = latex; }
    ins(span);
    sync();
    editorRef.current?.focus();
  };

  const handleSymClick = (sym: MathSym) => {
    if (sym.struct) insertStruct(sym.struct);
    else insertSimple(sym.latex);
  };

  /** Tab key navigates between slots */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      const active = document.activeElement as HTMLElement;
      if (!active?.dataset.slot) return;
      const struct = active.closest('[data-math-type]');
      if (!struct) return;
      const slots = struct.querySelectorAll('[data-slot]');
      const idx = Array.from(slots).indexOf(active);
      const next = slots[idx + (e.shiftKey ? -1 : 1)] as HTMLElement;
      if (next) { e.preventDefault(); next.focus(); }
    }
  };

  return (
    <div className={className}>
      <div className="border border-grain rounded-t-lg bg-grain/10 flex">
        {mathTabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-[12px] font-medium transition-colors cursor-pointer ${activeTab === tab.id ? 'bg-paper text-ink border-b-2 border-ink' : 'text-ink-muted hover:text-ink'}`}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="border border-t-0 border-grain px-3 py-2 flex flex-wrap gap-1">
        {mathTabs.find((t) => t.id === activeTab)?.symbols.map((sym) => (
          <button key={sym.display} onClick={() => handleSymClick(sym as MathSym)} title={sym.latex}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-[16px] text-ink hover:bg-grain/50 transition-colors cursor-pointer border border-transparent hover:border-grain">
            {sym.display}
          </button>
        ))}
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={sync} onKeyDown={handleKeyDown}
        data-placeholder="풀이과정을 입력하세요..."
        className="border border-t-0 border-grain rounded-b-lg px-4 py-3 text-[15px] text-ink leading-relaxed min-h-[120px] focus:outline-none focus:border-ink transition-colors [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-ink-muted"
      />
    </div>
  );
}

/** Single stroke point */
type Point = { x: number; y: number };

/** Stroke data */
type Stroke = { points: Point[]; color: string; width: number };

/** Solve phase */
type AssignmentPhase = 'answering' | 'wrong' | 'mirror';

/** Hesitation moment */
type Hesitation = { timestamp: number; duration: number; after: 'typing' | 'drawing' | 'idle' };

/** Per-question signal bundle */
type QuestionSignalState = {
  hesitations: Hesitation[];
  deleteCount: number;
  answerChanges: number;
  inputTimes: number[];
};

/** Persisted progress payload stored on the server */
type AssignmentProgressPayload = {
  version: 1;
  currentIdx: number;
  phase: AssignmentPhase;
  answers: Record<number, string>;
  workText: Record<number, string>;
  workDraw: Record<number, Stroke[]>;
  attempts: Record<number, number>;
  results: Record<number, boolean>;
  chatMessages: Record<number, { role: 'ai' | 'student'; content: string }[]>;
  advanceApproved: Record<number, boolean>;
  teacherHelpRequested: Record<number, boolean>;
  finalResult: { correct: number; total: number } | null;
  hesitationCounts: Record<number, number>;
  signals: Record<number, QuestionSignalState>;
};

/**
 * Vector-based canvas with zoom, pan, undo.
 *
 * @param props.strokes saved strokes
 * @param props.onSave callback when strokes change
 * @return canvas element
 */
function DrawCanvas({ strokes: savedStrokes, onSave, height, tool, setTool, penSize, setPenSize, onExpand, onCollapse, readOnly = false }: {
  strokes?: Stroke[];
  onSave: (strokes: Stroke[]) => void;
  height?: number;
  tool: 'pen' | 'eraser' | 'pan';
  setTool: (t: 'pen' | 'eraser' | 'pan') => void;
  penSize: number;
  setPenSize: (s: number) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  readOnly?: boolean;
}) {
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

  /** View transform (refs for real-time access) */
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  /** State mirrors for UI re-render */
  const [scaleUI, setScaleUI] = useState(1);

  /** Drawing state refs */
  const isDown = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  /** Touch pinch zoom state */
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  /**
   * Convert screen coords to world coords.
   *
   * @param e pointer event
   * @return world-space point
   */
  const toWorld = (e: React.PointerEvent): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - offsetRef.current.x) / scaleRef.current,
      y: (e.clientY - rect.top - offsetRef.current.y) / scaleRef.current,
    };
  };

  /**
   * Render all strokes to canvas.
   *
   * @return void
   */
  const render = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const s = scaleRef.current;
    const o = offsetRef.current;

    /** Clear */
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(s, s);

    /** Draw grid at 100% and above */
    if (s >= 1) {
      const gridSize = 20;
      ctx.strokeStyle = '#f0ede8';
      ctx.lineWidth = 0.5 / s;
      const startX = Math.floor(-o.x / s / gridSize) * gridSize;
      const startY = Math.floor(-o.y / s / gridSize) * gridSize;
      const endX = startX + w / s + gridSize;
      const endY = startY + h / s + gridSize;
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
    for (const st of all) {
      if (st.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(st.points[0].x, st.points[0].y);
      for (let i = 1; i < st.points.length; i++) {
        const p0 = st.points[i - 1];
        const p1 = st.points[i];
        ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      }
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    ctx.restore();
  };

  /**
   * Center content at a specific scale without auto-fitting.
   *
   * @param nextScale target scale
   * @return void
   */
  const centerContentAtScale = (nextScale: number) => {
    const container = containerRef.current;
    if (!container) return;
    scaleRef.current = nextScale;
    setScaleUI(nextScale);

    if (strokes.current.length === 0) {
      offsetRef.current = { x: 0, y: 0 };
      return;
    }

    const allPoints = strokes.current.flatMap((s) => s.points);
    if (allPoints.length === 0) {
      offsetRef.current = { x: 0, y: 0 };
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of allPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const pad = 30;
    const cw = container.offsetWidth;
    const ch = container.offsetHeight;
    const bw = maxX - minX + pad * 2;
    const bh = maxY - minY + pad * 2;
    offsetRef.current = {
      x: (cw - bw * nextScale) / 2 - (minX - pad) * nextScale,
      y: (ch - bh * nextScale) / 2 - (minY - pad) * nextScale,
    };
  };

  /** Initial render + resize */
  useEffect(() => {
    centerContentAtScale(1);
    render();
    const obs = new ResizeObserver(() => render());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  /** Reflect restored strokes when async progress hydration updates props. */
  useEffect(() => {
    strokes.current = savedStrokes ?? [];
    current.current = null;
    undoStack.current = [];
    redoStack.current = [];
    centerContentAtScale(1);
    render();
  }, [savedStrokes]);

  /** Whether eraser removed strokes (for undo snapshot) */
  const eraserDirty = useRef(false);

  /**
   * Check if a point is near any stroke and remove it.
   *
   * @param p world-space point
   * @return void
   */
  const eraseAt = (p: Point) => {
    const threshold = penSize * 5;
    const before = strokes.current.length;
    strokes.current = strokes.current.filter((s) =>
      !s.points.some((sp) => Math.hypot(sp.x - p.x, sp.y - p.y) < threshold + s.width)
    );
    if (strokes.current.length < before) {
      eraserDirty.current = true;
      onSave(strokes.current);
      render();
    }
  };

  /** Pointer down */
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    isDown.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const activeTool = readOnly ? 'pan' : tool;

    if (activeTool === 'pan') {
      panStart.current = { x: e.clientX, y: e.clientY };
      offsetStart.current = { ...offsetRef.current };
      return;
    }

    if (activeTool === 'eraser') {
      undoStack.current.push([...strokes.current]);
      redoStack.current = [];
      eraserDirty.current = false;
      eraseAt(toWorld(e));
      return;
    }

    /** Pressure-sensitive width */
    const pressure = e.pressure > 0 && e.pressure < 1 ? e.pressure : 0.5;

    undoStack.current.push([...strokes.current]);
    redoStack.current = [];
    current.current = {
      points: [toWorld(e)],
      color: '#1a1a1a',
      width: penSize * (0.5 + pressure),
    };
  };

  /** Pointer move */
  const onMove = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!isDown.current) return;
    const activeTool = readOnly ? 'pan' : tool;

    if (activeTool === 'pan') {
      offsetRef.current = {
        x: offsetStart.current.x + (e.clientX - panStart.current.x),
        y: offsetStart.current.y + (e.clientY - panStart.current.y),
      };
      render();
      return;
    }

    if (activeTool === 'eraser') {
      eraseAt(toWorld(e));
      return;
    }

    if (current.current) {
      current.current.points.push(toWorld(e));
      render();
    }
  };

  /** Pointer up */
  const onUp = (e: React.PointerEvent) => {
    e.preventDefault();
    isDown.current = false;
    const activeTool = readOnly ? 'pan' : tool;

    if (activeTool === 'eraser') {
      if (!eraserDirty.current) undoStack.current.pop();
      return;
    }

    if (current.current && current.current.points.length >= 2) {
      strokes.current.push(current.current);
      onSave(strokes.current);
    }
    current.current = null;
    render();
  };

  /** Touch pinch zoom + two-finger pan */
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStart.current = { dist: Math.hypot(dx, dy), scale: scaleRef.current };
      panStart.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      offsetStart.current = { ...offsetRef.current };
    }
  };

  /** Handle pinch move */
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStart.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(4, Math.max(0.5, pinchStart.current.scale * (dist / pinchStart.current.dist)));
      scaleRef.current = newScale;
      setScaleUI(newScale);

      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      offsetRef.current = {
        x: offsetStart.current.x + (mid.x - panStart.current.x),
        y: offsetStart.current.y + (mid.y - panStart.current.y),
      };
      render();
    }
  };

  /** End pinch */
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStart.current = null;
  };

  /** Undo */
  const undo = () => {
    if (readOnly) return;
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push([...strokes.current]);
    strokes.current = prev;
    onSave(strokes.current);
    render();
  };

  /** Redo */
  const redo = () => {
    if (readOnly) return;
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push([...strokes.current]);
    strokes.current = next;
    onSave(strokes.current);
    render();
  };

  /** Clear all */
  const clear = () => {
    if (readOnly) return;
    undoStack.current.push([...strokes.current]);
    redoStack.current = [];
    strokes.current = [];
    onSave([]);
    render();
  };

  /** Zoom */
  const zoom = (dir: 1 | -1) => {
    scaleRef.current = Math.min(4, Math.max(0.5, scaleRef.current + dir * 0.25));
    setScaleUI(scaleRef.current);
    render();
  };

  /** Reset view */
  const resetView = () => {
    centerContentAtScale(1);
    render();
  };

  /** Scroll to zoom */
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    scaleRef.current = Math.min(4, Math.max(0.5, scaleRef.current + dir * 0.1));
    setScaleUI(scaleRef.current);
    render();
  };

  /** Tool button helper */
  const ToolBtn = ({ active, onClick, children, title, disabled = false }: {
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title: string;
    disabled?: boolean;
  }) => (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
        disabled
          ? 'cursor-not-allowed text-ink-muted/40'
          : active
            ? 'bg-ink text-paper'
            : 'text-ink-muted hover:text-ink hover:bg-grain/50'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      {/* toolbar */}
      <div className="flex items-center gap-1 mb-2 px-1 shrink-0">
        {/* drawing tools */}
        <ToolBtn active={!readOnly && tool === 'pen'} onClick={() => setTool('pen')} title="펜" disabled={readOnly}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </ToolBtn>
        <ToolBtn active={!readOnly && tool === 'eraser'} onClick={() => setTool('eraser')} title="지우개" disabled={readOnly}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />
          </svg>
        </ToolBtn>
        <ToolBtn active={tool === 'pan' || readOnly} onClick={() => setTool('pan')} title="이동">
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
              disabled={readOnly}
              className={`rounded-full transition-colors cursor-pointer ${
                readOnly
                  ? 'cursor-not-allowed bg-ink/15'
                  : penSize === s
                    ? 'bg-ink'
                    : 'bg-ink/30 hover:bg-ink/60'
              }`}
              style={{ width: Math.max(6, s * 2 + 4), height: Math.max(6, s * 2 + 4) }}
            />
          ))}
        </div>

        {/* separator */}
        <div className="w-px h-5 bg-grain mx-1" />

        {/* undo/redo */}
        <ToolBtn onClick={undo} title="실행 취소" disabled={readOnly}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </ToolBtn>
        <ToolBtn onClick={redo} title="다시 실행" disabled={readOnly}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
        </ToolBtn>
        <ToolBtn onClick={clear} title="전체 지우기" disabled={readOnly}>
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
          {Math.round(scaleUI * 100)}%
        </button>
        <ToolBtn onClick={() => zoom(1)} title="확대">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6" /><path d="M8 11h6" />
          </svg>
        </ToolBtn>

        {(onExpand || onCollapse) && (
          <>
            <div className="w-px h-5 bg-grain mx-1" />
            {onExpand && (
              <ToolBtn onClick={onExpand} title="최대화">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </ToolBtn>
            )}
            {onCollapse && (
              <ToolBtn onClick={onCollapse} title="축소">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 14h6v6" /><path d="M20 10h-6V4" /><path d="M14 10l7-7" /><path d="M3 21l7-7" />
                </svg>
              </ToolBtn>
            )}
          </>
        )}
      </div>

      {/* canvas */}
      <div
        ref={containerRef}
        onWheel={onWheel}
        className={`relative overflow-hidden border border-grain rounded-lg bg-white ${height != null ? '' : 'flex-1 min-h-0'}`}
        style={height != null ? { height } : undefined}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className={`absolute inset-0 w-full h-full touch-none ${
            readOnly || tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : tool === 'eraser' ? '' : 'cursor-crosshair'
          }`}
          style={!readOnly && tool === 'eraser' ? { cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21'/%3E%3Cpath d='M22 21H7'/%3E%3Cpath d='m5 11 9 9'/%3E%3C/svg%3E") 12 12, auto` } : undefined}
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
  /** Work mode is always draw */
  /** Canvas tool */
  const [canvasTool, setCanvasTool] = useState<'pen' | 'eraser' | 'pan'>('pen');
  /** Canvas pen size */
  const [canvasPenSize, setCanvasPenSize] = useState(2);
  /** Fullscreen canvas mode */
  const [fullscreen, setFullscreen] = useState(false);
  /** Fullscreen visible (for animation) */
  const [fsVisible, setFsVisible] = useState(false);
  /** Typed work keyed by question ID */
  const [workText, setWorkText] = useState<Record<number, string>>({});
  /** Canvas strokes keyed by question ID */
  const [workDraw, setWorkDraw] = useState<Record<number, Stroke[]>>({});
  /** Current question index */
  const [currentIdx, setCurrentIdx] = useState(0);
  /** Phase per question: answering → wrong (retry) → mirror (explain to past-self) */
  const [phase, setPhase] = useState<AssignmentPhase>('answering');
  /** Wrong attempt count per question */
  const [attempts, setAttempts] = useState<Record<number, number>>({});
  /** Per-question correctness keyed by question ID */
  const [results, setResults] = useState<Record<number, boolean>>({});
  /** AI discussion messages keyed by question ID */
  const [chatMessages, setChatMessages] = useState<Record<number, { role: 'ai' | 'student'; content: string }[]>>({});
  /** Chat input */
  const [chatInput, setChatInput] = useState('');
  /** Whether past-self approved moving to the next step */
  const [advanceApproved, setAdvanceApproved] = useState<Record<number, boolean>>({});
  /** Whether the question was deferred with teacher help requested */
  const [teacherHelpRequested, setTeacherHelpRequested] = useState<Record<number, boolean>>({});
  /** Final submission result */
  const [finalResult, setFinalResult] = useState<{ correct: number; total: number } | null>(null);
  /** Submitting state */
  const [submitting, setSubmitting] = useState(false);

  /** Behavior signals per question */
  const signals = useRef<Record<number, QuestionSignalState>>({});
  /** Last input timestamp for gap detection */
  const lastInput = useRef<{ time: number; type: 'typing' | 'drawing' | 'idle' }>({ time: 0, type: 'idle' });
  /** Whether student was recently active (at least 3 inputs in last 10s) */
  const wasActive = useRef(false);
  /** Pause detection timer */
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Hesitation count for UI update */
  const [hesitationCounts, setHesitationCounts] = useState<Record<number, number>>({});
  /** Curriculum snapshot per question from API */
  const [questionCurriculum, setQuestionCurriculum] = useState<Record<number, QuestionCurriculumSnapshot>>({});
  /** Hidden-question inference request state per question */
  const whisperPending = useRef<Record<number, boolean>>({});
  const whisperLastSentKey = useRef<Record<number, string>>({});
  /** Whether initial progress restore has completed */
  const [progressReady, setProgressReady] = useState(false);
  /** Debounced autosave timer */
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Latest payload for pagehide flush */
  const latestProgressPayload = useRef<AssignmentProgressPayload | null>(null);

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

  const resetProgressState = () => {
    setAnswers({});
    setWorkText({});
    setWorkDraw({});
    setCurrentIdx(0);
    setPhase('answering');
    setAttempts({});
    setResults({});
    setChatMessages({});
    setChatInput('');
    setAdvanceApproved({});
    setTeacherHelpRequested({});
    setFinalResult(null);
    setHesitationCounts({});
    signals.current = {};
  };

  const buildProgressPayload = (): AssignmentProgressPayload => ({
    version: 1,
    currentIdx,
    phase,
    answers,
    workText,
    workDraw,
    attempts,
    results,
    chatMessages,
    advanceApproved,
    teacherHelpRequested,
    finalResult,
    hesitationCounts,
    signals: signals.current,
  });

  const persistProgress = (payload: AssignmentProgressPayload, keepalive = false) => {
    if (!id || !user) return Promise.resolve();
    return fetch(`${API}/api/assignments/${id}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: user.id,
        progress: payload,
      }),
      keepalive,
    }).catch(() => {});
  };

  /** Restore in-progress state from the server on load. */
  useEffect(() => {
    if (!id || !user) return;

    setProgressReady(false);
    latestProgressPayload.current = null;
    if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
    resetProgressState();

    let cancelled = false;
    fetch(`${API}/api/assignments/${id}/progress/${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.progress) return;
        const progress = data.progress as Partial<AssignmentProgressPayload>;
        setAnswers(progress.answers ?? {});
        setWorkText(progress.workText ?? {});
        setWorkDraw(progress.workDraw ?? {});
        setCurrentIdx(typeof progress.currentIdx === 'number' ? progress.currentIdx : 0);
        setPhase(
          progress.phase === 'wrong' || progress.phase === 'mirror' || progress.phase === 'answering'
            ? progress.phase
            : 'answering',
        );
        setAttempts(progress.attempts ?? {});
        setResults(progress.results ?? {});
        setChatMessages(progress.chatMessages ?? {});
        setAdvanceApproved(progress.advanceApproved ?? {});
        setTeacherHelpRequested(progress.teacherHelpRequested ?? {});
        setFinalResult(progress.finalResult ?? null);
        setHesitationCounts(progress.hesitationCounts ?? {});
        signals.current = progress.signals ?? {};
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProgressReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  /** Clamp restored index once question metadata is known. */
  useEffect(() => {
    if (questions.length === 0) return;
    setCurrentIdx((prev) => Math.max(0, Math.min(prev, questions.length - 1)));
  }, [questions.length]);

  /** Autosave progress to the server after local state changes. */
  useEffect(() => {
    if (!id || !user || !progressReady) return;
    const payload = buildProgressPayload();
    latestProgressPayload.current = payload;
    if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
    progressSaveTimer.current = setTimeout(() => {
      void persistProgress(payload);
    }, 80);

    return () => {
      if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
    };
  }, [
    id,
    user?.id,
    progressReady,
    currentIdx,
    phase,
    answers,
    workText,
    workDraw,
    attempts,
    results,
    chatMessages,
    advanceApproved,
    teacherHelpRequested,
    finalResult,
    hesitationCounts,
  ]);

  /** Save critical checkpoint state immediately after submits/phase changes. */
  useEffect(() => {
    if (!id || !user || !progressReady) return;
    const payload = buildProgressPayload();
    latestProgressPayload.current = payload;
    void persistProgress(payload);
  }, [
    id,
    user?.id,
    progressReady,
    currentIdx,
    phase,
    attempts,
    results,
    advanceApproved,
    teacherHelpRequested,
    finalResult,
  ]);

  /** Flush the latest progress on refresh/navigation. */
  useEffect(() => {
    if (!id || !user) return;
    const handlePageHide = () => {
      if (!latestProgressPayload.current) return;
      void persistProgress(latestProgressPayload.current, true);
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [id, user?.id]);

  /** Fetch curriculum snapshots for loaded questions */
  useEffect(() => {
    if (questions.length === 0) return;

    const missing = questions
      .map((question) => question.id)
      .filter((questionId) => !questionCurriculum[questionId]);

    if (missing.length === 0) return;

    let cancelled = false;
    fetchQuestionCurriculumMap(missing)
      .then((snapshotMap) => {
        if (cancelled) return;
        setQuestionCurriculum((prev) => ({ ...prev, ...snapshotMap }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [questions, questionCurriculum]);

  /** Current question */
  const q = questions[currentIdx];
  /** Whether the current question is cleared for progression */
  const currentTeacherHelpRequested = q ? !!teacherHelpRequested[q.id] : false;
  const currentAdvanceApproved = q ? !!advanceApproved[q.id] || !!teacherHelpRequested[q.id] : false;
  const currentChatLocked = currentAdvanceApproved;
  const currentCanvasLocked = currentAdvanceApproved || phase === 'mirror';
  const currentAnswerEditable = phase !== 'mirror' && !currentAdvanceApproved;

  /**
   * Check whether a target question is accessible.
   *
   * @param index question index
   * @return true if all previous questions are approved
   */
  const canAccessQuestion = (index: number) => (
    index <= 0 || questions.slice(0, index).every((question) => (
      !!advanceApproved[question.id] || !!teacherHelpRequested[question.id]
    ))
  );

  /**
   * Move to a question while respecting the progression gate.
   *
   * @param index question index
   * @return void
   */
  const moveToQuestion = (index: number) => {
    if (index < 0 || index >= questions.length || !canAccessQuestion(index)) return;
    const targetQuestion = questions[index];
    setCurrentIdx(index);
    setPhase(results[targetQuestion.id] ? 'mirror' : 'answering');
    setChatInput('');
  };

  /**
   * Normalize the expected answer for comparison.
   *
   * @param question assignment question
   * @return normalized answer string
   */
  const getCorrectAnswer = (question: Question) => {
    let correctAnswer = question.answer;
    try {
      const parsed = JSON.parse(question.answer);
      if (Array.isArray(parsed) && parsed.length > 0) correctAnswer = String(parsed[0]);
    } catch { /* not JSON */ }
    return correctAnswer.trim();
  };

  /**
   * Decide whether hidden-question analysis is worth sending.
   *
   * @param isCorrect whether the answer was correct
   * @param sig signal bundle for the question
   * @return true if the signal is meaningful
   */
  const shouldSendWhisper = (
    isCorrect: boolean,
    sig: { hesitations: Hesitation[]; deleteCount: number; answerChanges: number },
  ) => !isCorrect || sig.hesitations.length > 0 || sig.deleteCount > 0 || sig.answerChanges > 0;

  /**
   * Send hidden-question analysis once per question unless the previous attempt failed.
   *
   * @param question current question
   * @param studentAnswer student's submitted answer
   * @param isCorrect whether the answer was correct
   * @return void
   */
  const sendWhisperAnalysis = (question: Question, studentAnswer: string, isCorrect: boolean) => {
    if (!user || !id) return;
    const sig = getSignal(question.id);
    const curriculumSnapshot = questionCurriculum[question.id];
    if (!shouldSendWhisper(isCorrect, sig)) return;
    const requestKey = JSON.stringify({
      studentAnswer,
      isCorrect,
      hesitations: sig.hesitations.length,
      deleteCount: sig.deleteCount,
      answerChanges: sig.answerChanges,
      conceptId: curriculumSnapshot?.question.concept_id ?? question.concept_id,
    });
    if (whisperPending.current[question.id] || whisperLastSentKey.current[question.id] === requestKey) return;

    whisperPending.current[question.id] = true;

    fetch(`${API}/api/whisper/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: user.id,
        assignmentId: id,
        questionId: question.id,
        conceptId: curriculumSnapshot?.question.concept_id ?? question.concept_id,
        schoolLevel: curriculumSnapshot?.question.school_level ?? question.school_level,
        grade: curriculumSnapshot?.question.grade ?? question.grade,
        curriculumTopic: curriculumSnapshot?.question.curriculum_topic ?? question.curriculum_topic,
        questionText: question.question,
        questionAnswer: getCorrectAnswer(question),
        questionExplanation: question.explanation,
        studentAnswer,
        isCorrect,
        workText: workText[question.id] ?? '',
        signals: {
          hesitations: sig.hesitations,
          deleteCount: sig.deleteCount,
          answerChanges: sig.answerChanges,
        },
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (res.ok && data?.analysis) whisperLastSentKey.current[question.id] = requestKey;
      })
      .catch(() => {})
      .finally(() => {
        whisperPending.current[question.id] = false;
      });
  };

  /**
   * Get or init signal data for a question.
   *
   * @param qId question ID
   * @return signal data
   */
  const getSignal = (qId: number) => {
    if (!signals.current[qId]) {
      signals.current[qId] = { hesitations: [], deleteCount: 0, answerChanges: 0, inputTimes: [] };
    }
    return signals.current[qId];
  };

  /**
   * Record an input event and detect hesitation.
   *
   * @param inputType type of input
   * @return void
   */
  const recordInput = (inputType: 'typing' | 'drawing') => {
    if (!q) return;
    const now = Date.now();
    const sig = getSignal(q.id);
    sig.inputTimes.push(now);

    /** Check if was active before this gap */
    const recentInputs = sig.inputTimes.filter((t) => t > now - 15000);
    const prevActive = wasActive.current;
    wasActive.current = recentInputs.length >= 3;

    /** Detect hesitation: was active, then gap > 5s */
    if (prevActive && lastInput.current.time > 0) {
      const gap = now - lastInput.current.time;
      if (gap > 5000) {
        sig.hesitations.push({
          timestamp: lastInput.current.time,
          duration: gap,
          after: lastInput.current.type,
        });
        setHesitationCounts((prev) => ({ ...prev, [q.id]: sig.hesitations.length }));
      }
    }

    lastInput.current = { time: now, type: inputType };

    /** Reset pause timer */
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      if (!q) return;
      const s = getSignal(q.id);
      if (wasActive.current) {
        s.hesitations.push({ timestamp: now, duration: Date.now() - now, after: inputType });
        setHesitationCounts((prev) => ({ ...prev, [q.id]: s.hesitations.length }));
      }
    }, 8000);
  };

  /** Reset activity tracking when question changes */
  useEffect(() => {
    wasActive.current = false;
    lastInput.current = { time: 0, type: 'idle' };
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
  }, [currentIdx]);

  /**
   * Update answer for current question.
   *
   * @param value answer text
   * @return void
   */
  const setAnswer = (value: string) => {
    if (!q) return;
    const sig = getSignal(q.id);
    const prev = answers[q.id] ?? '';
    const prevTrimmed = prev.trim();
    const nextTrimmed = value.trim();
    /** Count full rewrites: had a real answer, then cleared most of it */
    if (prev.length >= 3 && value.length < prev.length * 0.3) sig.deleteCount++;
    if (
      prevTrimmed.length >= 2
      && nextTrimmed.length >= 2
      && prevTrimmed !== nextTrimmed
      && !prevTrimmed.startsWith(nextTrimmed)
      && !nextTrimmed.startsWith(prevTrimmed)
    ) {
      sig.answerChanges++;
    }
    recordInput('typing');
    setAnswers((p) => ({ ...p, [q.id]: value }));
  };

  /**
   * Submit current question answer and enter review phase.
   *
   * @return void
   */
  const submitCurrentQuestion = () => {
    if (!q) return;
    const myAnswer = answers[q.id]?.trim() ?? '';
    const correctAnswer = getCorrectAnswer(q);
    const isCorrect = myAnswer === correctAnswer;

    if (!isCorrect) {
      sendWhisperAnalysis(q, myAnswer, false);
      /** Wrong → retry */
      setAttempts((prev) => ({ ...prev, [q.id]: (prev[q.id] ?? 0) + 1 }));
      setPhase('wrong');
      return;
    }

    /** Correct → enter MirrorMind (past-self dialogue) */
    setResults((prev) => ({ ...prev, [q.id]: true }));
    const attemptCount = attempts[q.id] ?? 0;

    /** MirrorMind plays confused past-self, asks naive questions */
    const mirrorMsg = attemptCount > 0
      ? `오 맞았다! 근데 나는 아직 잘 모르겠어... 처음에 틀렸을 때랑 지금이 뭐가 달라진 거야? 나한테 설명해줄 수 있어?`
      : `오 정답이래! 근데 나는 이 문제 어떻게 푸는 건지 잘 모르겠거든... 어떻게 풀었는지 나한테 쉽게 설명해줄 수 있어?`;

    setAdvanceApproved((prev) => ({ ...prev, [q.id]: false }));
    setTeacherHelpRequested((prev) => ({ ...prev, [q.id]: false }));
    setChatMessages((prev) => ({ ...prev, [q.id]: [{ role: 'ai', content: mirrorMsg }] }));
    setChatInput('');
    setPhase('mirror');

    /** Send behavior signals to Whisper for teacher analysis */
    sendWhisperAnalysis(q, myAnswer, true);
  };

  /**
   * Go to next question from review phase.
   *
   * @return void
   */
  const goNext = () => {
    if (currentIdx < questions.length - 1) {
      moveToQuestion(currentIdx + 1);
    }
  };

  /**
   * Go to previous question.
   *
   * @return void
   */
  const goPrev = () => {
    if (currentIdx > 0) {
      const prevQ = questions[currentIdx - 1];
      setCurrentIdx(currentIdx - 1);
      setPhase(results[prevQ.id] ? 'mirror' : 'answering');
      setChatInput('');
    }
  };

  /**
   * Send chat message in review phase.
   *
   * @return void
   */
  /** Chat loading state */
  const [chatLoading, setChatLoading] = useState(false);
  /** Manual teacher-help request state */
  const [teacherHelpLoading, setTeacherHelpLoading] = useState(false);

  /**
   * Send message to MirrorMind (past-self AI).
   *
   * @return void
   */
  const sendChat = async () => {
    if (!user || !q || !chatInput.trim() || chatLoading || advanceApproved[q.id] || teacherHelpRequested[q.id]) return;
    const questionId = q.id;
    const msgs = chatMessages[questionId] ?? [];
    const withStudent = [...msgs, { role: 'student' as const, content: chatInput.trim() }];
    setChatMessages((prev) => ({ ...prev, [questionId]: withStudent }));
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch(`${API}/api/mirror/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: user.id,
          assignmentId: id,
          questionId,
          conceptId: q.concept_id,
          schoolLevel: q.school_level,
          grade: q.grade,
          curriculumTopic: q.curriculum_topic,
          questionText: q.question,
          questionAnswer: getCorrectAnswer(q),
          questionExplanation: q.explanation,
          studentAnswer: answers[questionId]?.trim() ?? '',
          workText: workText[questionId] ?? '',
          messages: withStudent.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content })),
        }),
      });
      const data = await res.json();
      const aiReply = data.reply ?? '음... 잘 모르겠어. 좀 더 쉽게 설명해줄 수 있어?';
      if (data.allowNextQuestion) {
        setAdvanceApproved((prev) => ({ ...prev, [questionId]: true }));
      }
      if (data.teacherHelpRequested) {
        setTeacherHelpRequested((prev) => ({ ...prev, [questionId]: true }));
      }
      setChatMessages((prev) => ({
        ...prev,
        [questionId]: [...(prev[questionId] ?? []), { role: 'ai', content: aiReply }],
      }));
    } catch {
      /** Fallback if API fails */
      const fallbacks = [
        '음... 그게 무슨 뜻이야? 좀 더 쉽게 설명해줄 수 있어?',
        '아 그렇구나... 근데 왜 그렇게 되는 거야?',
        '오 좀 알 것 같아! 그럼 다른 경우에도 그렇게 되는 거야?',
        '아 이제 이해했어! 고마워!',
      ];
      const idx = Math.min((msgs.length - 1) / 2, fallbacks.length - 1);
      setChatMessages((prev) => ({
        ...prev,
        [questionId]: [...(prev[questionId] ?? []), { role: 'ai', content: fallbacks[Math.floor(idx)] }],
      }));
    } finally {
      setChatLoading(false);
    }
  };

  /**
   * Defer the current problem and notify the teacher.
   *
   * @return void
   */
  const requestTeacherHelp = async () => {
    if (!user || !q || teacherHelpLoading || currentAdvanceApproved) return;

    setTeacherHelpLoading(true);
    try {
      const res = await fetch(`${API}/api/mirror/request-teacher-help`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: user.id,
          assignmentId: id,
          questionId: q.id,
          conceptId: q.concept_id,
          studentAnswer: answers[q.id]?.trim() ?? '',
          workText: workText[q.id] ?? '',
          messages: (chatMessages[q.id] ?? []).map((message) => ({
            role: message.role === 'ai' ? 'assistant' : 'user',
            content: message.content,
          })),
          attempts: attempts[q.id] ?? 0,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? '선생님 도움 요청 중 오류가 발생했습니다.');
      }

      setTeacherHelpRequested((prev) => ({ ...prev, [q.id]: true }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '선생님 도움 요청 중 오류가 발생했습니다.');
    } finally {
      setTeacherHelpLoading(false);
    }
  };

  /**
   * Open fullscreen with animation.
   *
   * @return void
   */
  const openFullscreen = () => {
    setFullscreen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setFsVisible(true)));
  };

  /**
   * Close fullscreen with animation.
   *
   * @return void
   */
  const closeFullscreen = () => {
    setFsVisible(false);
    setTimeout(() => setFullscreen(false), 300);
  };

  /**
   * Submit all answers to server (final).
   *
   * @return void
   */
  const handleFinalSubmit = async () => {
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
      if (!res.ok) {
        const lockedIds = Array.isArray(data?.questionIds) ? data.questionIds.join(', ') : null;
        throw new Error(lockedIds
          ? `잠긴 문제의 답안을 수정할 수 없습니다. 문제 번호: ${lockedIds}`
          : '제출할 수 없는 답안 변경이 감지되었습니다.');
      }
      setFinalResult(data);

      questions.forEach((question) => {
        const answer = answers[question.id]?.trim() ?? '';
        sendWhisperAnalysis(question, answer, answer === getCorrectAnswer(question));
      });

      /** Send behavior signals to server */
      const signalData = questions.map((q) => {
        const s = signals.current[q.id];
        return s ? {
          questionId: q.id,
          hesitations: s.hesitations,
          deleteCount: s.deleteCount,
          answerChanges: s.answerChanges,
        } : null;
      }).filter(Boolean);
      fetch(`${API}/api/assignments/${id}/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user.id, signals: signalData }),
      }).catch(() => {});
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '제출 처리 중 오류가 발생했습니다.');
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
          {questions.length > 0 && !finalResult && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {questions.map((qq, i) => {
                const r = results[qq.id];
                const available = canAccessQuestion(i);
                return (
                  <button
                    key={i}
                    onClick={() => moveToQuestion(i)}
                    disabled={!available}
                    className={`w-7 h-7 rounded-full text-[11px] font-mono font-medium transition-colors ${
                      i === currentIdx
                        ? 'bg-ink text-paper'
                        : r === true && (attempts[qq.id] ?? 0) > 0
                          ? 'bg-amber-400 text-paper'
                          : r === true
                            ? 'bg-emerald-500 text-paper'
                            : r === false
                              ? 'bg-red-400 text-paper'
                              : answers[qq.id]?.trim()
                            ? 'bg-ink/20 text-ink'
                            : 'bg-grain/50 text-ink-muted'
                    } ${
                      available ? 'cursor-pointer' : 'cursor-not-allowed opacity-35'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* final result */}
        {finalResult ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className={`rounded-2xl p-10 border text-center ${
              finalResult.correct === finalResult.total
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-paper border-grain'
            }`}>
              <p className="text-[48px] font-display text-ink mb-2">
                {finalResult.correct}/{finalResult.total}
              </p>
              <p className="text-[16px] text-ink-muted">
                {finalResult.correct === finalResult.total
                  ? '모두 정답입니다!'
                  : `${finalResult.total}문제 중 ${finalResult.correct}문제 정답`}
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
                          onClick={() => currentAnswerEditable && setAnswer(k)}
                          className={`w-full text-left px-5 py-3 rounded-lg border transition-colors ${currentAnswerEditable ? 'cursor-pointer' : ''} ${
                            selected
                              ? 'border-ink bg-ink/5'
                              : 'border-grain' + (currentAnswerEditable ? ' hover:border-ink/30' : '')
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && currentAnswered && currentAnswerEditable) submitCurrentQuestion(); }}
                  placeholder="답을 입력하세요"
                  disabled={!currentAnswerEditable}
                  autoFocus
                  className="w-full border border-grain rounded-lg px-5 py-3 font-mono text-[16px] text-ink focus:outline-none focus:border-ink transition-colors disabled:bg-grain/20"
                />
              )}

              {/* work/solution section */}
              <div className="mt-6 pt-5 border-t border-grain">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">풀이과정</span>
                </div>
                {fullscreen ? (
                  <div className="border border-dashed border-grain rounded-lg h-[60px] flex items-center justify-center">
                    <span className="text-[12px] text-ink-muted">최대화 모드에서 편집 중</span>
                  </div>
                ) : (
                  <>
                    <DrawCanvas
                      key={q.id}
                      strokes={workDraw[q.id]}
                      onSave={(s) => { recordInput('drawing'); setWorkDraw((prev) => ({ ...prev, [q.id]: s })); }}
                      height={240}
                      tool={canvasTool}
                      setTool={setCanvasTool}
                      penSize={canvasPenSize}
                      setPenSize={setCanvasPenSize}
                      onExpand={openFullscreen}
                      readOnly={currentCanvasLocked}
                    />
                    {currentCanvasLocked && (
                      <p className="mt-2 text-[12px] text-ink-muted">
                        {currentTeacherHelpRequested
                          ? '선생님 도움 요청으로 문제 풀이가 종료되어 풀이과정은 읽기 전용입니다.'
                          : phase === 'mirror' && !currentAdvanceApproved
                            ? '정답이 확인되어 풀이과정은 더 이상 수정할 수 없습니다.'
                            : '과거의 내가 이해를 완료해 풀이과정은 더 이상 수정할 수 없습니다.'}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* wrong phase: retry prompt */}
            {phase === 'wrong' && q && !currentTeacherHelpRequested && (
              <div className="mt-6 border-t border-grain pt-6">
                <div className="rounded-lg p-4 bg-red-50 border border-red-200">
                  <p className="text-[15px] font-medium text-ink">
                    오답입니다. {(attempts[q.id] ?? 0) > 1 ? `(${attempts[q.id]}번째 시도)` : ''} 다시 풀어보세요.
                  </p>
                </div>
              </div>
            )}

            {currentTeacherHelpRequested && phase !== 'mirror' && (
              <div className="mt-6 border-t border-grain pt-6">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[15px] font-medium text-ink">
                    선생님께 도움 요청을 남기고 이 문제를 보류했습니다.
                  </p>
                  <p className="mt-1 text-[13px] text-amber-800">
                    지금은 답안과 풀이를 수정할 수 없고, 다음 단계로 진행할 수 있습니다.
                  </p>
                </div>
              </div>
            )}

            {/* mirror phase: MirrorMind past-self dialogue */}
            {phase === 'mirror' && q && (
              <div className="mt-6 border-t border-grain pt-6">
                <div className="rounded-lg p-4 mb-4 bg-emerald-50 border border-emerald-200">
                  <p className="text-[15px] font-medium text-ink">정답입니다!</p>
                </div>

                <div className="mb-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">과거의 나에게 설명하기</span>
                </div>

                {/* chat messages */}
                <div className="space-y-4 mb-4 max-h-[300px] overflow-y-auto">
                  {(chatMessages[q.id] ?? []).map((msg, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className={`text-[10px] uppercase tracking-[0.14em] font-mono font-medium ${msg.role === 'ai' ? 'text-clay-deep' : 'text-ink'}`}>
                        {msg.role === 'ai' ? '과거의 나' : '나'}
                      </span>
                      <p className={`text-[15px] leading-relaxed ${msg.role === 'ai' ? 'text-ink-muted' : 'text-ink'}`}>
                        {msg.content}
                      </p>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.14em] font-mono font-medium text-clay-deep">과거의 나</span>
                      <span className="text-[14px] text-ink-muted animate-pulse">생각 중...</span>
                    </div>
                  )}
                </div>

                {/* chat input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !chatLoading && !currentChatLocked) sendChat(); }}
                    placeholder={
                      currentTeacherHelpRequested
                        ? '선생님 도움 요청으로 대화가 종료되었습니다.'
                        : currentChatLocked
                          ? '문제 풀이가 완료되어 더 이상 대화할 수 없습니다.'
                          : '과거의 나에게 설명해주세요...'
                    }
                    disabled={chatLoading || currentChatLocked}
                    className="flex-1 border border-grain rounded-lg px-4 py-2.5 text-[14px] text-ink focus:outline-none focus:border-ink transition-colors disabled:bg-grain/20"
                  />
                  <button
                    onClick={sendChat}
                    disabled={!chatInput.trim() || chatLoading || currentChatLocked}
                    className="h-10 px-4 rounded-lg bg-ink text-paper text-[13px] font-medium cursor-pointer hover:bg-ink-soft transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    전송
                  </button>
                </div>
                <p className={`mt-3 text-[12px] ${currentTeacherHelpRequested ? 'text-amber-700' : currentAdvanceApproved ? 'text-emerald-700' : 'text-ink-muted'}`}>
                  {currentTeacherHelpRequested
                    ? '선생님께 도움 요청을 남기고 이 문제는 보류 처리했습니다. 다음 단계로 진행할 수 있습니다.'
                    : currentAdvanceApproved
                    ? '과거의 내가 개념을 이해했습니다. 이제 다음 단계로 진행할 수 있습니다.'
                    : '과거의 내가 이해했다고 판단하기 전까지는 다음 문제로 넘어갈 수 없습니다.'}
                </p>
              </div>
            )}

            {/* navigation */}
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={goPrev}
                disabled={currentIdx === 0}
                className="h-11 px-5 rounded-full text-[14px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← 이전
              </button>
              <div className="flex items-center gap-2">
                {!currentAdvanceApproved && (
                  <button
                    onClick={requestTeacherHelp}
                    disabled={teacherHelpLoading || chatLoading}
                    className="h-11 px-5 rounded-full border border-grain bg-paper text-[14px] font-medium text-ink hover:border-ink/40 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {teacherHelpLoading ? '요청 중...' : '보류 후 도움 요청'}
                  </button>
                )}
                {currentAdvanceApproved ? (
                  isLast ? (
                    <button
                      onClick={handleFinalSubmit}
                      disabled={submitting}
                      className="h-11 px-6 rounded-full bg-ink text-paper font-medium text-[14px] hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {submitting ? '제출 중...' : '최종 제출'}
                    </button>
                  ) : (
                    <button
                      onClick={goNext}
                      className="h-11 px-5 rounded-full bg-ink text-paper font-medium text-[14px] hover:bg-ink-soft transition-colors cursor-pointer"
                    >
                      다음 문제 →
                    </button>
                  )
                ) : phase !== 'mirror' ? (
                  <button
                    onClick={submitCurrentQuestion}
                    disabled={!currentAnswered}
                    className="h-11 px-6 rounded-full bg-ink text-paper font-medium text-[14px] hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {phase === 'wrong' ? '다시 제출' : '제출'}
                  </button>
                ) : isLast ? (
                  <button
                    onClick={handleFinalSubmit}
                    disabled={submitting || !currentAdvanceApproved}
                    className="h-11 px-6 rounded-full bg-ink text-paper font-medium text-[14px] hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {submitting ? '제출 중...' : '최종 제출'}
                  </button>
                ) : (
                  <button
                    onClick={goNext}
                    disabled={!currentAdvanceApproved}
                    className="h-11 px-5 rounded-full bg-ink text-paper font-medium text-[14px] hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    다음 문제 →
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-grain rounded-lg p-8 text-center">
            <p className="text-[14px] text-ink-muted">문제를 불러오는 중...</p>
          </div>
        )}
      </div>

      {/* fullscreen canvas overlay */}
      {fullscreen && q && (
        <div className={`fixed inset-0 z-50 bg-paper flex transition-all duration-300 ease-in-out ${
          fsVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`} style={{ transformOrigin: 'center bottom' }}>
          {/* left: question */}
          <div className="w-96 shrink-0 border-r border-grain overflow-y-auto p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[14px] font-mono font-bold text-ink">{currentIdx + 1}.</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[q.difficulty] ?? ''}`}>
                {q.difficulty}
              </span>
              <span className="text-[10px] font-mono text-ink-muted">{q.type}</span>
            </div>
            <Latex text={q.question} className="text-[16px] text-ink leading-relaxed block mb-6" />
            {q.type === '객관식' && q.choices && (() => {
              const parsed = JSON.parse(q.choices) as Record<string, string>;
              return (
                <div className="space-y-2">
                  {Object.entries(parsed).map(([k, v]) => (
                    <div key={k} className="text-[13px] text-ink-muted font-mono">
                      {'①②③④⑤'[Number(k) - 1] ?? k} <Latex text={v} />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* answer in fullscreen */}
            <div className="mt-6 pt-4 border-t border-grain">
              <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono block mb-2">답</span>
              {q.type === '객관식' && q.choices ? (() => {
                const parsed = JSON.parse(q.choices) as Record<string, string>;
                return (
                  <div className="space-y-1.5">
                    {Object.entries(parsed).map(([k, v]) => {
                      const selected = answers[q.id] === k;
                      return (
                        <button
                          key={k}
                          onClick={() => currentAnswerEditable && setAnswer(k)}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-[13px] transition-colors ${
                            currentAnswerEditable ? 'cursor-pointer' : 'cursor-default'
                          } ${
                            selected ? 'border-ink bg-ink/5' : 'border-grain' + (currentAnswerEditable ? ' hover:border-ink/30' : '')
                          }`}
                        >
                          <span className="font-mono text-ink-muted mr-2">{'①②③④⑤'[Number(k) - 1] ?? k}</span>
                          <Latex text={v} className="text-ink" />
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
                  placeholder="답을 입력하세요"
                  disabled={!currentAnswerEditable}
                  className="w-full border border-grain rounded-lg px-4 py-2.5 font-mono text-[14px] text-ink focus:outline-none focus:border-ink transition-colors disabled:bg-grain/20"
                />
              )}
            </div>
          </div>

          {/* right: canvas */}
          <div className="flex-1 flex flex-col">
            {/* canvas area */}
            <div className="flex-1 p-4 overflow-hidden min-h-0">
              <DrawCanvas
                key={q.id}
                strokes={workDraw[q.id]}
                onSave={(s) => { recordInput('drawing'); setWorkDraw((prev) => ({ ...prev, [q.id]: s })); }}
                tool={canvasTool}
                setTool={setCanvasTool}
                penSize={canvasPenSize}
                setPenSize={setCanvasPenSize}
                onCollapse={closeFullscreen}
                readOnly={currentCanvasLocked}
              />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
