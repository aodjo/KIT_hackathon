import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import AppLayout from '../components/AppLayout';
import {
  fetchQuestionCurriculumMap,
  type QuestionCurriculumSnapshot,
} from '../lib/curriculumApi';

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

type Analysis = {
  studentId: number;
  studentName: string;
  questionId: number;
  stuckPoint: string;
  missingConcepts: string[];
  recommendedPractice: string;
  confidence: number;
  teacherNoticeRequested: boolean;
  teacherNoticeReason: string | null;
  createdAt: string;
};

type MirrorConversation = {
  studentId: number;
  studentName: string;
  questionId: number;
  messages: { role: 'ai' | 'student'; content: string }[];
  createdAt: string;
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

type SidebarDropdownOption = {
  value: string;
  label: string;
};

/**
 * Custom dropdown used in the analysis sidebar.
 *
 * @param props.label control label
 * @param props.value selected option value
 * @param props.options available options
 * @param props.onChange selection callback
 * @return dropdown element
 */
function SidebarDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SidebarDropdownOption[];
  onChange: (nextValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-11 w-full cursor-pointer items-center justify-between rounded-xl border bg-paper px-4 text-left text-[14px] leading-none transition-colors ${
          open ? 'border-ink shadow-[0_8px_18px_rgba(40,38,34,0.08)]' : 'border-grain hover:border-ink/40'
        }`}
      >
        <span className="truncate text-ink">{selected?.label ?? '선택'}</span>
        <span
          className={`ml-3 shrink-0 text-[12px] text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-grain bg-paper shadow-paper-lg">
          <div className="max-h-64 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (option.value !== value) onChange(option.value);
                }}
                className={`flex h-11 w-full cursor-pointer items-center px-4 text-left text-[14px] leading-none transition-colors ${
                  option.value === value ? 'bg-ink text-paper' : 'text-ink hover:bg-grain/30'
                }`}
              >
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Curriculum concept mind map.
 *
 * @param props.snapshot curriculum snapshot
 * @return mind map element
 */
function CurriculumMindMap({ snapshot }: { snapshot: QuestionCurriculumSnapshot }) {
  if (!snapshot.concept || snapshot.lineage.length === 0) return null;

  const current = snapshot.concept;
  const prerequisites = snapshot.lineage.filter((concept) => concept.id !== current.id);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [desktopLayout, setDesktopLayout] = useState(
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 640px)').matches,
  );
  const [dragging, setDragging] = useState(false);
  const DEFAULT_SCALE = 0.83;
  const MIN_SCALE = 0.55;
  const MAX_SCALE = 2.1;
  const [view, setView] = useState({ scale: DEFAULT_SCALE, x: 0, y: 0 });
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;
  const semanticZoom = clamp01((view.scale - 0.72) / 0.95);
  const contextProgress = clamp01((view.scale - 0.88) / 0.36);
  const detailProgress = clamp01((view.scale - 1.22) / 0.46);
  const zoomLabel = view.scale < 0.9 ? '요약' : view.scale < 1.28 ? '맥락' : '상세';
  const infoMode: 'overview' | 'context' | 'detail' = view.scale < 0.9
    ? 'overview'
    : view.scale < 1.28
      ? 'context'
      : 'detail';

  const desktopProfile = {
    branchWidth: lerp(148, 236, semanticZoom),
    branchHeight: lerp(62, 146, semanticZoom),
    coreWidth: lerp(220, 316, semanticZoom),
    coreHeight: lerp(92, 182, semanticZoom),
    leftColumnX: lerp(226, 24, semanticZoom),
    rightColumnX: lerp(334, 306, semanticZoom),
    coreX: lerp(482, 636, semanticZoom),
    paddingY: lerp(76, 28, semanticZoom),
    rightColumnOffsetY: lerp(12, 28, semanticZoom),
    minRowGap: lerp(14, 42, semanticZoom),
    railOffset: lerp(56, 126, semanticZoom),
    coreCurveInset: lerp(44, 106, semanticZoom),
  };
  const mobileProfile = {
    branchWidth: lerp(152, 228, semanticZoom),
    branchHeight: lerp(60, 134, semanticZoom),
    coreWidth: lerp(224, 296, semanticZoom),
    coreHeight: lerp(96, 172, semanticZoom),
    gutter: lerp(104, 18, semanticZoom),
    paddingTop: lerp(44, 28, semanticZoom),
    columnOffsetY: lerp(10, 22, semanticZoom),
    minRowGap: lerp(18, 36, semanticZoom),
    branchCurveDepth: lerp(26, 64, semanticZoom),
    coreCurveInset: lerp(22, 56, semanticZoom),
  };
  const desktopRows = Math.max(1, Math.ceil(prerequisites.length / 2));
  const mobileRows = Math.max(1, Math.ceil(prerequisites.length / 2));
  const sceneWidth = desktopLayout ? 980 : 760;
  const sceneHeight = desktopLayout
    ? Math.max(
        520,
        96
          + desktopRows * 146
          + Math.max(0, desktopRows - 1) * 42,
      )
    : Math.max(
        660,
        88
          + mobileRows * 134
          + Math.max(0, mobileRows - 1) * 36
          + 172
          + 112,
      );
  const viewportHeight = desktopLayout ? 360 : 420;

  /**
   * Keep zoom scale within the supported range.
   *
   * @param nextScale requested scale
   * @return clamped scale
   */
  const clampScale = (nextScale: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));

  /**
   * Reset the map to the centered default scale.
   *
   * @return void
   */
  const resetView = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nextScale = DEFAULT_SCALE;
    setView({
      scale: nextScale,
      x: (viewport.clientWidth - sceneWidth * nextScale) / 2,
      y: (viewport.clientHeight - sceneHeight * nextScale) / 2,
    });
  };

  /**
   * Zoom relative to a viewport anchor point.
   *
   * @param requestedScale next scale
   * @param anchorX viewport-space x
   * @param anchorY viewport-space y
   * @return void
   */
  const zoomAt = (requestedScale: number, anchorX: number, anchorY: number) => {
    setView((prev) => {
      const nextScale = clampScale(requestedScale);
      const worldX = (anchorX - prev.x) / prev.scale;
      const worldY = (anchorY - prev.y) / prev.scale;
      return {
        scale: nextScale,
        x: anchorX - worldX * nextScale,
        y: anchorY - worldY * nextScale,
      };
    });
  };

  /**
   * Zoom from the viewport center.
   *
   * @param factor zoom multiplier
   * @return void
   */
  const zoomBy = (factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    zoomAt(
      view.scale * factor,
      viewport.clientWidth / 2,
      viewport.clientHeight / 2,
    );
  };

  const isCanvasControlTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest('[data-canvas-control="true"]'));

  const stopCanvasControlEvent = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  /** Sync layout mode with the active breakpoint. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 640px)');
    const handleChange = (event: MediaQueryListEvent) => setDesktopLayout(event.matches);
    setDesktopLayout(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  /** Fit scene when the dataset or layout mode changes. */
  useEffect(() => {
    resetView();
  }, [desktopLayout, snapshot.concept.id, snapshot.lineage.length]);

  /** Re-fit when the viewport size itself changes. */
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => resetView());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [desktopLayout, snapshot.concept.id, snapshot.lineage.length]);

  const renderNode = (
    concept: QuestionCurriculumSnapshot['lineage'][number],
    tone: 'core' | 'branch',
  ) => {
    const summaryLabel = concept.curriculum.at(-1) ?? concept.curriculum[0];
    const contextLabel = concept.curriculum.slice(-2).join(' · ') || summaryLabel;
    const detailLabel = concept.curriculum.join(', ');
    const bodyText = infoMode === 'overview'
      ? summaryLabel
      : infoMode === 'context'
        ? contextLabel
        : detailLabel;
    const bodyLineClamp = infoMode === 'overview' ? 1 : infoMode === 'context' ? 2 : 4;
    const titleSize = lerp(10.4, 13.8, semanticZoom);
    const idSize = lerp(9, 10.5, semanticZoom);
    const radius = lerp(28, 22, semanticZoom);

    return (
      <div
        className={`h-full w-full overflow-hidden border shadow-[0_12px_28px_rgba(40,38,34,0.08)] ${
          tone === 'core'
            ? 'border-ink bg-ink text-paper'
            : 'border-grain bg-paper/90 text-ink'
        }`}
        style={{ borderRadius: radius }}
      >
        <div
          className="h-full"
          style={{
            padding: `${lerp(9, 16, semanticZoom)}px ${lerp(11, 16, semanticZoom)}px`,
          }}
        >
          <p
            className={`font-mono uppercase ${
              tone === 'core' ? 'text-paper/75' : 'text-clay-deep'
            }`}
            style={{
              fontSize: idSize,
              letterSpacing: `${lerp(1.2, 2.2, semanticZoom)}px`,
              lineHeight: 1.1,
            }}
          >
            {concept.id}
          </p>
          <p
            className={`font-mono ${
              tone === 'core' ? 'text-paper/75' : 'text-ink-muted'
            }`}
            style={{
              fontSize: lerp(9.6, 11.2, semanticZoom),
              marginTop: lerp(0, 8, contextProgress),
              opacity: contextProgress,
              maxHeight: lerp(0, 18, contextProgress),
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              transform: `translateY(${lerp(-5, 0, contextProgress)}px)`,
            }}
          >
            {concept.schoolLevel} {concept.grade}
          </p>
          <p
            className={tone === 'core' ? 'text-paper' : 'text-ink'}
            style={{
              marginTop: lerp(5, 8, semanticZoom),
              fontSize: titleSize,
              lineHeight: lerp(1.28, 1.55, semanticZoom),
              display: '-webkit-box',
              WebkitLineClamp: bodyLineClamp,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {bodyText}
          </p>
          {tone === 'core' && (
            <p
              className="font-mono uppercase text-paper/60"
              style={{
                fontSize: lerp(8.6, 10, detailProgress),
                letterSpacing: `${lerp(0.6, 2.1, detailProgress)}px`,
                marginTop: lerp(0, 10, detailProgress),
                opacity: detailProgress,
                maxHeight: lerp(0, 14, detailProgress),
                overflow: 'hidden',
                transform: `translateY(${lerp(-3, 0, detailProgress)}px)`,
              }}
            >
              현재 개념
            </p>
          )}
        </div>
      </div>
    );
  };

  const desktopCoreNode = {
    x: lerp(sceneWidth / 2 - desktopProfile.coreWidth / 2, desktopProfile.coreX, semanticZoom),
    y: (sceneHeight - desktopProfile.coreHeight) / 2,
    width: desktopProfile.coreWidth,
    height: desktopProfile.coreHeight,
    anchorX: lerp(sceneWidth / 2 - desktopProfile.coreWidth / 2, desktopProfile.coreX, semanticZoom),
    anchorY: sceneHeight / 2,
  };

  const mobileCoreNode = {
    x: sceneWidth / 2 - mobileProfile.coreWidth / 2,
    y: sceneHeight - mobileProfile.coreHeight - 36,
    width: mobileProfile.coreWidth,
    height: mobileProfile.coreHeight,
    anchorX: sceneWidth / 2,
    anchorY: sceneHeight - mobileProfile.coreHeight - 36,
  };

  const desktopNodes = prerequisites.map((concept, index) => {
    const column = index % 2;
    const rowIndex = Math.floor(index / 2);
    const rowsInColumn = Math.max(1, Math.ceil((prerequisites.length - column) / 2));

    const expandedTopPadding = desktopProfile.paddingY;
    const expandedBottomPadding = desktopProfile.paddingY;
    const expandedAvailableHeight = Math.max(
      0,
      sceneHeight - expandedTopPadding - expandedBottomPadding - rowsInColumn * desktopProfile.branchHeight,
    );
    const expandedDistributedGap = rowsInColumn <= 1 ? 0 : expandedAvailableHeight / (rowsInColumn - 1);
    const expandedRowGap = rowsInColumn <= 1 ? 0 : Math.max(expandedDistributedGap, desktopProfile.minRowGap);
    const expandedY = expandedTopPadding
      + rowIndex * (desktopProfile.branchHeight + expandedRowGap)
      + (column === 1 ? desktopProfile.rightColumnOffsetY : 0);
    const expandedX = column === 0 ? desktopProfile.leftColumnX : desktopProfile.rightColumnX;

    const collapsedRowGap = lerp(8, 18, semanticZoom);
    const collapsedGroupHeight = rowsInColumn * desktopProfile.branchHeight
      + Math.max(0, rowsInColumn - 1) * collapsedRowGap;
    const collapsedBaseY = Math.max(
      18,
      Math.min(
        sceneHeight - collapsedGroupHeight - 18,
        desktopCoreNode.anchorY - collapsedGroupHeight / 2 + (column === 1 ? 10 : -10),
      ),
    );
    const collapsedY = collapsedBaseY + rowIndex * (desktopProfile.branchHeight + collapsedRowGap);

    const collapsedInnerX = desktopCoreNode.x - desktopProfile.branchWidth - lerp(20, 30, semanticZoom);
    const collapsedOuterX = collapsedInnerX - desktopProfile.branchWidth - lerp(14, 24, semanticZoom);
    const collapsedX = column === 0 ? collapsedOuterX : collapsedInnerX;

    const x = lerp(collapsedX, expandedX, semanticZoom);
    const y = lerp(collapsedY, expandedY, semanticZoom);

    return {
      concept,
      x,
      y,
      anchorX: x + desktopProfile.branchWidth,
      anchorY: y + desktopProfile.branchHeight / 2,
    };
  });

  const mobileNodes = prerequisites.map((concept, index) => {
    const row = Math.floor(index / 2);
    const column = index % 2;

    const expandedCoreY = mobileCoreNode.y;
    const expandedAvailableHeight = Math.max(
      0,
      expandedCoreY - mobileProfile.paddingTop - 28 - mobileRows * mobileProfile.branchHeight,
    );
    const expandedDistributedGap = mobileRows <= 1 ? 0 : expandedAvailableHeight / (mobileRows - 1);
    const expandedRowGap = mobileRows <= 1 ? 0 : Math.max(expandedDistributedGap, mobileProfile.minRowGap);
    const expandedY = mobileProfile.paddingTop
      + row * (mobileProfile.branchHeight + expandedRowGap)
      + (column === 1 ? mobileProfile.columnOffsetY : 0);
    const expandedX = column === 0
      ? mobileProfile.gutter
      : sceneWidth - mobileProfile.gutter - mobileProfile.branchWidth;

    const collapsedRowGap = lerp(10, 16, semanticZoom);
    const collapsedGroupHeight = mobileRows * mobileProfile.branchHeight
      + Math.max(0, mobileRows - 1) * collapsedRowGap;
    const collapsedBaseY = Math.max(
      20,
      Math.min(
        mobileCoreNode.y - collapsedGroupHeight - 18,
        mobileCoreNode.y - collapsedGroupHeight - 28,
      ),
    );
    const collapsedY = collapsedBaseY
      + row * (mobileProfile.branchHeight + collapsedRowGap)
      + (column === 1 ? lerp(4, 10, semanticZoom) : 0);
    const collapsedLeftX = sceneWidth / 2 - mobileProfile.branchWidth - lerp(10, 18, semanticZoom);
    const collapsedRightX = sceneWidth / 2 + lerp(10, 18, semanticZoom);
    const collapsedX = column === 0 ? collapsedLeftX : collapsedRightX;

    const x = lerp(collapsedX, expandedX, semanticZoom);
    const y = lerp(collapsedY, expandedY, semanticZoom);

    return {
      concept,
      x,
      y,
      anchorX: x + mobileProfile.branchWidth / 2,
      anchorY: y + mobileProfile.branchHeight,
    };
  });

  return (
    <div className="mt-1">
      <div
        ref={viewportRef}
        className={`relative overflow-hidden rounded-2xl border border-grain bg-[radial-gradient(circle_at_top,rgba(244,240,232,0.9),rgba(255,255,255,0.95))] touch-none select-none ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ height: viewportHeight }}
        onDoubleClick={resetView}
        onWheel={(e) => {
          if (isCanvasControlTarget(e.target)) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const factor = e.deltaY > 0 ? 1 / 1.08 : 1.08;
          zoomAt(view.scale * factor, e.clientX - rect.left, e.clientY - rect.top);
        }}
        onPointerDown={(e) => {
          if (isCanvasControlTarget(e.target)) return;
          dragState.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originX: view.x,
            originY: view.y,
          };
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const activeDrag = dragState.current;
          if (!activeDrag || activeDrag.pointerId !== e.pointerId) return;
          setView((prev) => ({
            ...prev,
            x: activeDrag.originX + (e.clientX - activeDrag.startX),
            y: activeDrag.originY + (e.clientY - activeDrag.startY),
          }));
        }}
        onPointerUp={(e) => {
          if (dragState.current?.pointerId !== e.pointerId) return;
          dragState.current = null;
          setDragging(false);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={(e) => {
          if (dragState.current?.pointerId !== e.pointerId) return;
          dragState.current = null;
          setDragging(false);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onLostPointerCapture={() => {
          dragState.current = null;
          setDragging(false);
        }}
      >
        <div
          data-canvas-control="true"
          className="absolute right-3 top-3 z-10 flex items-center gap-1.5"
          onClick={stopCanvasControlEvent}
          onPointerDown={stopCanvasControlEvent}
          onWheel={stopCanvasControlEvent}
        >
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.15)}
            className="h-8 w-8 cursor-pointer rounded-full border border-grain bg-paper text-[16px] text-ink transition-colors hover:border-ink"
            aria-label="축소"
          >
            -
          </button>
          <button
            type="button"
            onClick={resetView}
            className="h-8 cursor-pointer rounded-full border border-grain bg-paper px-3 text-[11px] font-mono text-ink transition-colors hover:border-ink"
            aria-label="기본 배율로 맞추기"
          >
            {Math.round(view.scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.15)}
            className="h-8 w-8 cursor-pointer rounded-full border border-grain bg-paper text-[16px] text-ink transition-colors hover:border-ink"
            aria-label="확대"
          >
            +
          </button>
        </div>
        <div
          className="absolute left-0 top-0 will-change-transform"
          style={{
            width: sceneWidth,
            height: sceneHeight,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
        >
          {desktopLayout ? (
            <div className="relative h-full w-full">
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {desktopNodes.map((node) => (
                  <path
                    key={node.concept.id}
                    d={`M ${node.anchorX} ${node.anchorY} C ${node.anchorX + desktopProfile.railOffset} ${node.anchorY}, ${desktopCoreNode.anchorX - desktopProfile.coreCurveInset} ${desktopCoreNode.anchorY}, ${desktopCoreNode.anchorX} ${desktopCoreNode.anchorY}`}
                    fill="none"
                    stroke="#cfc7ba"
                    strokeWidth={lerp(2.1, 3.2, semanticZoom)}
                  />
                ))}
              </svg>
              {desktopNodes.map((node) => (
                <div
                  key={node.concept.id}
                  className="absolute"
                  style={{
                    left: node.x,
                    top: node.y,
                    width: desktopProfile.branchWidth,
                    height: desktopProfile.branchHeight,
                  }}
                >
                  {renderNode(node.concept, 'branch')}
                </div>
              ))}
              <div
                className="absolute"
                style={{
                  left: desktopCoreNode.x,
                  top: desktopCoreNode.y,
                  width: desktopCoreNode.width,
                  height: desktopCoreNode.height,
                }}
              >
                {renderNode(current, 'core')}
              </div>
            </div>
          ) : (
            <div className="relative h-full w-full">
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${sceneWidth} ${sceneHeight}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {mobileNodes.map((node) => (
                  <path
                    key={node.concept.id}
                    d={`M ${node.anchorX} ${node.anchorY} C ${node.anchorX} ${node.anchorY + mobileProfile.branchCurveDepth}, ${mobileCoreNode.anchorX} ${mobileCoreNode.anchorY - mobileProfile.coreCurveInset}, ${mobileCoreNode.anchorX} ${mobileCoreNode.anchorY}`}
                    fill="none"
                    stroke="#cfc7ba"
                    strokeWidth={lerp(2.1, 3.2, semanticZoom)}
                    strokeDasharray="2.5 2.5"
                  />
                ))}
              </svg>
              {mobileNodes.map((node) => (
                <div
                  key={node.concept.id}
                  className="absolute"
                  style={{
                    left: node.x,
                    top: node.y,
                    width: mobileProfile.branchWidth,
                    height: mobileProfile.branchHeight,
                  }}
                >
                  {renderNode(node.concept, 'branch')}
                </div>
              ))}
              <div
                className="absolute"
                style={{
                  left: mobileCoreNode.x,
                  top: mobileCoreNode.y,
                  width: mobileCoreNode.width,
                  height: mobileCoreNode.height,
                }}
              >
                {renderNode(current, 'core')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  /** Mirror chat transcripts keyed by student/question */
  const [conversations, setConversations] = useState<MirrorConversation[]>([]);
  /** Curriculum snapshot keyed by question ID */
  const [analysisCurriculum, setAnalysisCurriculum] = useState<Record<number, QuestionCurriculumSnapshot>>({});
  /** Selected student filter for analysis cards */
  const [selectedStudent, setSelectedStudent] = useState('all');
  /** Expanded mirror-chat cards keyed by student/question */
  const [openConversationKeys, setOpenConversationKeys] = useState<Record<string, boolean>>({});
  /** Expanded concept-map cards keyed by student/question */
  const [openConceptMapKeys, setOpenConceptMapKeys] = useState<Record<string, boolean>>({});
  const analysisMap = new Map(analyses.map((analysis) => [`${analysis.studentId}:${analysis.questionId}`, analysis]));
  const conversationMap = new Map(conversations.map((conversation) => [`${conversation.studentId}:${conversation.questionId}`, conversation]));
  const analysisCards = Array.from(new Set([
    ...analyses.map((analysis) => `${analysis.studentId}:${analysis.questionId}`),
    ...conversations.map((conversation) => `${conversation.studentId}:${conversation.questionId}`),
  ]))
    .map((key) => {
      const analysis = analysisMap.get(key);
      const conversation = conversationMap.get(key);
      return {
        studentId: analysis?.studentId ?? conversation?.studentId ?? 0,
        studentName: analysis?.studentName ?? conversation?.studentName ?? '',
        questionId: analysis?.questionId ?? conversation?.questionId ?? 0,
        stuckPoint: analysis?.stuckPoint ?? null,
        missingConcepts: analysis?.missingConcepts ?? [],
        recommendedPractice: analysis?.recommendedPractice ?? null,
        confidence: analysis?.confidence ?? null,
        teacherNoticeRequested: analysis?.teacherNoticeRequested ?? false,
        teacherNoticeReason: analysis?.teacherNoticeReason ?? null,
        createdAt: analysis?.createdAt ?? conversation?.createdAt ?? '',
        messages: conversation?.messages ?? [],
        hasAnalysis: !!analysis,
      };
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  const studentOptions = Array.from(new Set(analysisCards.map((card) => card.studentName).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, 'ko-KR'));
  const filteredAnalyses = selectedStudent === 'all'
    ? analysisCards
    : analysisCards.filter((analysis) => analysis.studentName === selectedStudent);
  const showAnalysisSidebar = tab === 'analysis';
  const studentDropdownOptions: SidebarDropdownOption[] = [
    { value: 'all', label: '전체 학생' },
    ...studentOptions.map((studentName) => ({
      value: studentName,
      label: studentName,
    })),
  ];

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

  /** Fetch mirror chat transcripts for teacher review */
  useEffect(() => {
    if (!id) return;
    const load = () => {
      fetch(`${API}/api/mirror/assignment/${id}`)
        .then((r) => r.json())
        .then((d) => setConversations(d.conversations ?? []))
        .catch(() => {});
    };

    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [id]);

  /** Reset the student filter when the assignment changes */
  useEffect(() => {
    setSelectedStudent('all');
    setOpenConversationKeys({});
    setOpenConceptMapKeys({});
  }, [id]);

  /** Fetch curriculum snapshots for analysed questions */
  useEffect(() => {
    const questionIds = Array.from(new Set([
      ...analyses.map((analysis) => analysis.questionId),
      ...conversations.map((conversation) => conversation.questionId),
    ]));

    if (questionIds.length === 0) return;

    const missing = Array.from(new Set(
      questionIds.filter((questionId) => !analysisCurriculum[questionId]),
    ));

    if (missing.length === 0) return;

    let cancelled = false;
    fetchQuestionCurriculumMap(missing)
      .then((snapshotMap) => {
        if (cancelled) return;
        setAnalysisCurriculum((prev) => ({ ...prev, ...snapshotMap }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [analyses, conversations, analysisCurriculum]);

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
      <div className="flex-1 w-full px-6 py-10">
        <div className={`mx-auto flex w-full gap-8 ${showAnalysisSidebar ? 'max-w-7xl flex-col xl:flex-row' : 'max-w-4xl'}`}>
          <div className="min-w-0 flex-1">
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
                학습 분석 {analysisCards.length > 0 && `(${analysisCards.length})`}
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
              analysisCards.length === 0 ? (
                <div className="border border-grain rounded-lg p-8 text-center">
                  <p className="text-[14px] text-ink-muted">아직 분석된 데이터가 없습니다.</p>
                  <p className="text-[12px] text-ink-muted mt-1">학생들이 문제를 풀면서 막히는 순간이 감지되면 AI가 분석합니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAnalyses.length === 0 ? (
                    <div className="border border-grain rounded-lg p-8 text-center bg-paper">
                      <p className="text-[14px] text-ink-muted">선택한 학생의 분석 데이터가 없습니다.</p>
                    </div>
                  ) : filteredAnalyses.map((a, i) => {
                    const curriculum = analysisCurriculum[a.questionId];
                    const questionNumber = questions.findIndex((q) => q.id === a.questionId) + 1;
                    const cardKey = `${a.studentId}:${a.questionId}`;
                    const conversationOpen = !!openConversationKeys[cardKey];
                    const conceptMapOpen = !!openConceptMapKeys[cardKey];
                    const conversationPreview = a.messages.length > 0
                      ? a.messages[a.messages.length - 1].content
                      : '';
                    const trimmedConversationPreview = conversationPreview.length > 88
                      ? `${conversationPreview.slice(0, 88)}...`
                      : conversationPreview;
                    const conceptMapSummary = curriculum?.concept
                      ? `${curriculum.concept.id} · ${curriculum.lineage.length}개 개념 노드`
                      : `${curriculum?.lineage.length ?? 0}개 개념 노드`;

                    return (
                      <div key={i} className="border border-grain rounded-lg p-5 bg-paper">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-medium text-ink">{a.studentName}</span>
                            <span className="text-[10px] font-mono text-ink-muted">문제 {questionNumber}</span>
                            {a.teacherNoticeRequested && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                도움 요청
                              </span>
                            )}
                          </div>
                          {a.confidence != null ? (
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                              a.confidence > 0.7 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
                            }`}>
                              {Math.round(a.confidence * 100)}%
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-grain bg-grain/20 text-ink-muted">
                              대화 기록
                            </span>
                          )}
                        </div>
                        <div className="space-y-3">
                          {a.teacherNoticeRequested && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <span className="text-[10px] uppercase tracking-[0.14em] text-amber-700 font-medium font-mono">선생님 알림</span>
                              <p className="text-[13px] text-ink mt-1">
                                {a.teacherNoticeReason ?? '학생이 현재 개념 설명을 이어가기 어려워 선생님 도움이 필요하다고 판단했습니다.'}
                              </p>
                            </div>
                          )}
                          {a.hasAnalysis ? (
                            <>
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
                            </>
                          ) : (
                            <div className="rounded-lg border border-grain bg-grain/15 p-3">
                              <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">학습 분석</span>
                              <p className="text-[13px] text-ink-muted mt-1">아직 별도 분석은 없고, 학생의 설명 대화 기록만 있습니다.</p>
                            </div>
                          )}
                          {a.messages.length > 0 && (
                            <div>
                              <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">설명 대화</span>
                              <div className="mt-2 overflow-hidden rounded-lg border border-grain bg-grain/10">
                                <button
                                  type="button"
                                  onClick={() => setOpenConversationKeys((prev) => ({
                                    ...prev,
                                    [cardKey]: !prev[cardKey],
                                  }))}
                                  aria-expanded={conversationOpen}
                                  className="flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-grain/20"
                                >
                                  <div className="min-w-0">
                                    <p className="text-[13px] text-ink">
                                      학생과 AI가 나눈 {a.messages.length}개 메시지
                                    </p>
                                    {trimmedConversationPreview && (
                                      <p className="mt-1 truncate text-[11px] text-ink-muted">
                                        {trimmedConversationPreview}
                                      </p>
                                    )}
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <span className="inline-flex min-w-7 items-center justify-center rounded-full border border-grain bg-paper px-2 py-0.5 text-[10px] font-mono text-ink-muted">
                                      {a.messages.length}
                                    </span>
                                  </div>
                                </button>
                                <div
                                  aria-hidden={!conversationOpen}
                                  className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                    conversationOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                                  }`}
                                >
                                  <div className="min-h-0 overflow-hidden">
                                    <div className="space-y-3 border-t border-grain bg-paper/70 p-4">
                                      {a.messages.map((message, index) => (
                                        <div key={index} className="flex flex-col gap-1">
                                          <span className={`text-[10px] uppercase tracking-[0.14em] font-mono font-medium ${message.role === 'ai' ? 'text-clay-deep' : 'text-ink'}`}>
                                            {message.role === 'ai' ? '과거의 나' : '학생'}
                                          </span>
                                          <p className={`text-[13px] leading-relaxed ${message.role === 'ai' ? 'text-ink-muted' : 'text-ink'}`}>
                                            {message.content}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          {curriculum && curriculum.lineage.length > 0 && (
                            <div>
                              <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">개념 맵</span>
                              <div className="mt-2 overflow-hidden rounded-lg border border-grain bg-grain/10">
                                <button
                                  type="button"
                                  onClick={() => setOpenConceptMapKeys((prev) => ({
                                    ...prev,
                                    [cardKey]: !prev[cardKey],
                                  }))}
                                  aria-expanded={conceptMapOpen}
                                  className="flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-grain/20"
                                >
                                  <div className="min-w-0">
                                    <p className="text-[13px] text-ink">
                                      {conceptMapSummary}
                                    </p>
                                    <p className="mt-1 truncate text-[11px] text-ink-muted">
                                      선수 개념 경로와 현재 단원 관계 보기
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <span className="inline-flex min-w-7 items-center justify-center rounded-full border border-grain bg-paper px-2 py-0.5 text-[10px] font-mono text-ink-muted">
                                      {curriculum.lineage.length}
                                    </span>
                                  </div>
                                </button>
                                <div
                                  aria-hidden={!conceptMapOpen}
                                  className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                    conceptMapOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                                  }`}
                                >
                                  <div className="min-h-0 overflow-hidden">
                                    <div className="border-t border-grain bg-paper/70 p-4">
                                      <CurriculumMindMap snapshot={curriculum} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          {a.recommendedPractice && (
                            <div>
                              <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">추천 연습</span>
                              <p className="text-[14px] text-ink mt-1">{a.recommendedPractice}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {showAnalysisSidebar && (
            <aside className="w-full xl:w-[280px] shrink-0">
              <div className="xl:sticky xl:top-8 space-y-3">
                <div className="rounded-2xl border border-grain bg-paper p-5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
                    학생 필터
                  </p>
                  <p className="mt-2 text-[14px] text-ink">
                    현재 과제 안에서 학생별 학습 분석을 좁혀서 비교할 수 있습니다.
                  </p>
                </div>
                <div className="rounded-2xl border border-grain bg-paper p-5">
                  <SidebarDropdown
                    label="학생"
                    value={selectedStudent}
                    options={studentDropdownOptions}
                    onChange={setSelectedStudent}
                  />
                </div>
                <div className="rounded-2xl border border-grain bg-grain/15 p-5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
                    현재 보기
                  </p>
                  <div className="mt-3 space-y-2 text-[13px] text-ink-muted">
                    <p>학생: <span className="text-ink">{selectedStudent === 'all' ? '전체 학생' : selectedStudent}</span></p>
                  </div>
                  <p className="mt-4 text-[12px] font-mono text-ink-muted">
                    {filteredAnalyses.length}개 분석 표시
                  </p>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
