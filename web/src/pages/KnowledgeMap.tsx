import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {
  fetchCurriculumGraph,
  fetchQuestionCurriculumGraph,
  type CurriculumConcept,
  type CurriculumGraph,
  type CurriculumRelation,
  type QuestionCurriculumGraph,
} from '../lib/curriculumApi';

type SourceMode = 'concept' | 'question';
type ZoomMode = 'overview' | 'context' | 'detail';

type KnowledgeMapGraph = CurriculumGraph & {
  question?: QuestionCurriculumGraph['question'];
};

type LayoutNode = {
  concept: CurriculumConcept;
  x: number;
  y: number;
  width: number;
  height: number;
  stageKey: string;
  subject: string;
};

type LayoutStage = {
  key: string;
  schoolLevel: string;
  grade: string;
  label: string;
  x: number;
  width: number;
};

type LayoutLane = {
  subject: string;
  y: number;
  height: number;
};

const DEFAULT_CONCEPT_ID = 'D29';
const EXAMPLE_CONCEPT_IDS = ['D23', 'D29', 'C17', 'P14'];
const SUBJECT_ORDER = ['수와 연산', '도형과 측정', '변화와 관계', '자료와 가능성'] as const;
const STAGE_ORDER = [
  { schoolLevel: '초등학교', grade: '1학년', label: '초1' },
  { schoolLevel: '초등학교', grade: '2학년', label: '초2' },
  { schoolLevel: '초등학교', grade: '3학년', label: '초3' },
  { schoolLevel: '초등학교', grade: '4학년', label: '초4' },
  { schoolLevel: '초등학교', grade: '5학년', label: '초5' },
  { schoolLevel: '초등학교', grade: '6학년', label: '초6' },
  { schoolLevel: '중학교', grade: '1학년', label: '중1' },
  { schoolLevel: '중학교', grade: '2학년', label: '중2' },
  { schoolLevel: '중학교', grade: '3학년', label: '중3' },
  { schoolLevel: '고등학교', grade: '공통수학1', label: '공통1' },
  { schoolLevel: '고등학교', grade: '공통수학2', label: '공통2' },
  { schoolLevel: '고등학교', grade: '대수', label: '대수' },
  { schoolLevel: '고등학교', grade: '미적분I', label: '미적분I' },
  { schoolLevel: '고등학교', grade: '미적분II', label: '미적분II' },
  { schoolLevel: '고등학교', grade: '기하', label: '기하' },
  { schoolLevel: '고등학교', grade: '확률과 통계', label: '확통' },
] as const;

const SUBJECT_INDEX = new Map<string, number>(SUBJECT_ORDER.map((subject, index) => [subject, index]));
const STAGE_INDEX = new Map<string, number>(
  STAGE_ORDER.map((stage, index) => [`${stage.schoolLevel}:${stage.grade}`, index]),
);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getStageKey(concept: Pick<CurriculumConcept, 'schoolLevel' | 'grade'>) {
  return `${concept.schoolLevel}:${concept.grade}`;
}

function compareConcepts(left: CurriculumConcept, right: CurriculumConcept) {
  const leftStage = STAGE_INDEX.get(getStageKey(left)) ?? Number.MAX_SAFE_INTEGER;
  const rightStage = STAGE_INDEX.get(getStageKey(right)) ?? Number.MAX_SAFE_INTEGER;
  if (leftStage !== rightStage) return leftStage - rightStage;

  const leftSubject = SUBJECT_INDEX.get(left.subject) ?? Number.MAX_SAFE_INTEGER;
  const rightSubject = SUBJECT_INDEX.get(right.subject) ?? Number.MAX_SAFE_INTEGER;
  if (leftSubject !== rightSubject) return leftSubject - rightSubject;

  return left.id.localeCompare(right.id, 'ko-KR');
}

function wrapText(text: string, maxChars: number, maxLines: number) {
  const chars = Array.from(text.trim());
  if (chars.length === 0) return [];

  const lines: string[] = [];
  let index = 0;

  while (index < chars.length && lines.length < maxLines) {
    const remaining = chars.length - index;
    const take = Math.min(maxChars, remaining);
    lines.push(chars.slice(index, index + take).join(''));
    index += take;
  }

  if (index < chars.length && lines.length > 0) {
    const last = Array.from(lines[lines.length - 1]);
    lines[lines.length - 1] = `${last.slice(0, Math.max(0, last.length - 1)).join('')}…`;
  }

  return lines;
}

function ellipsize(text: string, maxChars: number) {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join('')}…`;
}

function buildAdjacency(relations: CurriculumRelation[]) {
  const adjacency = new Map<string, Set<string>>();

  relations.forEach((relation) => {
    const source = adjacency.get(relation.sourceId) ?? new Set<string>();
    source.add(relation.targetId);
    adjacency.set(relation.sourceId, source);

    const target = adjacency.get(relation.targetId) ?? new Set<string>();
    target.add(relation.sourceId);
    adjacency.set(relation.targetId, target);
  });

  return adjacency;
}

function buildKnowledgeLayout(graph: KnowledgeMapGraph) {
  const concepts = [...graph.concepts].sort(compareConcepts);
  const nodeWidth = 184;
  const nodeHeight = 92;
  const nodeGap = 12;
  const columnWidth = 212;
  const columnGap = 52;
  const headerHeight = 112;
  const laneGap = 36;
  const laneInnerPad = 18;
  const leftPad = 188;
  const rightPad = 88;
  const topPad = 42;
  const bottomPad = 72;

  const maxLaneCount = Math.max(
    1,
    ...STAGE_ORDER.flatMap((stage) => (
      SUBJECT_ORDER.map((subject) => (
        concepts.filter((concept) => getStageKey(concept) === `${stage.schoolLevel}:${stage.grade}` && concept.subject === subject).length
      ))
    )),
  );

  const laneHeight = Math.max(
    160,
    laneInnerPad * 2 + maxLaneCount * nodeHeight + Math.max(0, maxLaneCount - 1) * nodeGap,
  );

  const sceneWidth = leftPad + STAGE_ORDER.length * columnWidth + Math.max(0, STAGE_ORDER.length - 1) * columnGap + rightPad;
  const sceneHeight = topPad + headerHeight + SUBJECT_ORDER.length * laneHeight + Math.max(0, SUBJECT_ORDER.length - 1) * laneGap + bottomPad;

  const stages: LayoutStage[] = STAGE_ORDER.map((stage, index) => ({
    ...stage,
    key: `${stage.schoolLevel}:${stage.grade}`,
    x: leftPad + index * (columnWidth + columnGap),
    width: columnWidth,
  }));

  const lanes: LayoutLane[] = SUBJECT_ORDER.map((subject, index) => ({
    subject,
    y: topPad + headerHeight + index * (laneHeight + laneGap),
    height: laneHeight,
  }));

  const nodes: LayoutNode[] = [];

  stages.forEach((stage) => {
    lanes.forEach((lane) => {
      const laneConcepts = concepts.filter((concept) => (
        getStageKey(concept) === stage.key && concept.subject === lane.subject
      ));

      if (laneConcepts.length === 0) return;

      const totalHeight = laneConcepts.length * nodeHeight + Math.max(0, laneConcepts.length - 1) * nodeGap;
      const startY = lane.y + (lane.height - totalHeight) / 2;

      laneConcepts.forEach((concept, index) => {
        nodes.push({
          concept,
          x: stage.x + (stage.width - nodeWidth) / 2,
          y: startY + index * (nodeHeight + nodeGap),
          width: nodeWidth,
          height: nodeHeight,
          stageKey: stage.key,
          subject: lane.subject,
        });
      });
    });
  });

  return {
    sceneWidth,
    sceneHeight,
    nodes,
    stages,
    lanes,
    relations: graph.relations,
  };
}

function KnowledgeGraph({
  graph,
  onSelectConcept,
}: {
  graph: KnowledgeMapGraph;
  onSelectConcept: (conceptId: string) => void;
}) {
  if (graph.concepts.length === 0) return null;

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fitScale, setFitScale] = useState(0.22);
  const [view, setView] = useState({ scale: 0.22, x: 0, y: 0 });
  const { sceneWidth, sceneHeight, nodes, stages, lanes, relations } = buildKnowledgeLayout(graph);
  const nodeById = new Map(nodes.map((node) => [node.concept.id, node]));
  const adjacency = buildAdjacency(relations);
  const current = graph.concept;
  const directNeighborIds = current ? adjacency.get(current.id) ?? new Set<string>() : new Set<string>();
  const zoomRatio = view.scale / Math.max(fitScale, 0.0001);
  const zoomMode: ZoomMode = zoomRatio < 1.3 ? 'overview' : zoomRatio < 2.1 ? 'context' : 'detail';

  const getScaleBounds = (baseScale: number) => ({
    min: clamp(baseScale * 0.82, 0.12, 0.72),
    max: clamp(baseScale * 5.8, 0.96, 2.4),
  });

  const resetView = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const nextFitScale = clamp(
      Math.min((viewport.clientWidth - 72) / sceneWidth, (viewport.clientHeight - 72) / sceneHeight),
      0.12,
      0.72,
    );

    setFitScale(nextFitScale);
    setView({
      scale: nextFitScale,
      x: (viewport.clientWidth - sceneWidth * nextFitScale) / 2,
      y: (viewport.clientHeight - sceneHeight * nextFitScale) / 2,
    });
  };

  const clampScale = (requestedScale: number) => {
    const bounds = getScaleBounds(fitScale);
    return clamp(requestedScale, bounds.min, bounds.max);
  };

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

  const zoomBy = (factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    zoomAt(view.scale * factor, viewport.clientWidth / 2, viewport.clientHeight / 2);
  };

  const isUiControlTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('[data-graph-control="true"]'));

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest('[data-graph-control="true"], [data-graph-node="true"]'));

  useEffect(() => {
    resetView();
  }, [sceneHeight, sceneWidth]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => resetView());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [sceneHeight, sceneWidth]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (isUiControlTarget(event.target)) return;

      const rect = viewport.getBoundingClientRect();
      const anchorX = event.clientX - rect.left;
      const anchorY = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAt(view.scale * factor, anchorX, anchorY);
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [fitScale, view.scale]);

  const renderNode = (node: LayoutNode) => {
    const isCurrent = current?.id === node.concept.id;
    const isDirectNeighbor = directNeighborIds.has(node.concept.id);
    const title = node.concept.curriculum.at(-1) ?? node.concept.id;
    const contextText = `${node.concept.schoolLevel} ${node.concept.grade} · ${node.concept.subject}`;
    const detailText = node.concept.curriculum.join(', ');
    const directCount = adjacency.get(node.concept.id)?.size ?? 0;
    const bodyLines = wrapText(
      zoomMode === 'detail' ? detailText : title,
      zoomMode === 'overview' ? 10 : zoomMode === 'context' ? 14 : 16,
      zoomMode === 'overview' ? 2 : zoomMode === 'context' ? 2 : 3,
    );
    const background = isCurrent ? '#1c1913' : isDirectNeighbor ? '#f1e8d9' : 'rgba(255, 253, 248, 0.96)';
    const stroke = isCurrent ? '#1c1913' : isDirectNeighbor ? 'rgba(140,111,79,0.45)' : 'rgba(188,175,154,0.9)';
    const titleFill = isCurrent ? 'rgba(255,250,240,0.96)' : '#1f1a15';
    const metaFill = isCurrent ? 'rgba(255,250,240,0.68)' : '#8f7f68';
    const bodyY = zoomMode === 'overview' ? node.y + 42 : node.y + 50;
    const contextVisible = zoomMode !== 'overview';
    const detailVisible = zoomMode === 'detail';

    return (
      <g
        key={node.concept.id}
        data-graph-node="true"
        onClick={() => !isCurrent && onSelectConcept(node.concept.id)}
        style={{ cursor: isCurrent ? 'default' : 'pointer' }}
      >
        <rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx={24}
          fill={background}
          stroke={stroke}
          strokeWidth={isCurrent ? 1.8 : 1.2}
          filter="drop-shadow(0 10px 28px rgba(40,38,34,0.08))"
        />
        <text
          x={node.x + 14}
          y={node.y + 20}
          fill={metaFill}
          fontFamily="var(--font-mono, monospace)"
          fontSize="10"
          letterSpacing="1.4"
        >
          {node.concept.id}
        </text>
        {contextVisible && (
          <text
            x={node.x + 14}
            y={node.y + 33}
            fill={metaFill}
            fontFamily="var(--font-mono, monospace)"
            fontSize="9"
          >
            {ellipsize(contextText, 26)}
          </text>
        )}
        {isCurrent && (
          <>
            <rect
              x={node.x + node.width - 56}
              y={node.y + 11}
              width={42}
              height={18}
              rx={9}
              fill="rgba(255,250,240,0.08)"
              stroke="rgba(255,250,240,0.16)"
              strokeWidth="1"
            />
            <text
              x={node.x + node.width - 35}
              y={node.y + 23.5}
              fill="rgba(255,250,240,0.72)"
              fontFamily="var(--font-mono, monospace)"
              fontSize="8.5"
              letterSpacing="1.2"
              textAnchor="middle"
            >
              Focus
            </text>
          </>
        )}
        <text
          x={node.x + 14}
          y={bodyY}
          fill={titleFill}
          fontFamily="var(--font-display, serif)"
          fontSize={zoomMode === 'overview' ? 12.5 : zoomMode === 'context' ? 13.4 : 14.2}
        >
          {bodyLines.map((line, index) => (
            <tspan
              key={`${node.concept.id}-line-${index}`}
              x={node.x + 14}
              dy={index === 0 ? 0 : zoomMode === 'overview' ? 16 : 18}
            >
              {line}
            </tspan>
          ))}
        </text>
        {detailVisible && (
          <text
            x={node.x + 14}
            y={node.y + node.height - 12}
            fill={metaFill}
            fontFamily="var(--font-mono, monospace)"
            fontSize="9"
          >
            {`직접 연결 ${directCount}개`}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="overflow-hidden rounded-[36px] border border-grain bg-[#f9f6ef]/94 shadow-[0_28px_80px_rgba(58,46,38,0.1)]">
      <div
        ref={viewportRef}
        className={`relative h-[720px] w-full touch-none select-none overscroll-contain ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || isInteractiveTarget(event.target)) return;
          const viewport = viewportRef.current;
          if (!viewport) return;

          dragState.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: view.x,
            originY: view.y,
          };
          viewport.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const drag = dragState.current;
          if (!drag || drag.pointerId !== event.pointerId) return;

          setView((prev) => ({
            ...prev,
            x: drag.originX + event.clientX - drag.startX,
            y: drag.originY + event.clientY - drag.startY,
          }));
        }}
        onPointerUp={(event) => {
          const viewport = viewportRef.current;
          if (!dragState.current || dragState.current.pointerId !== event.pointerId) return;

          if (viewport?.hasPointerCapture(event.pointerId)) {
            viewport.releasePointerCapture(event.pointerId);
          }

          dragState.current = null;
          setDragging(false);
        }}
        onPointerCancel={(event) => {
          const viewport = viewportRef.current;
          if (!dragState.current || dragState.current.pointerId !== event.pointerId) return;

          if (viewport?.hasPointerCapture(event.pointerId)) {
            viewport.releasePointerCapture(event.pointerId);
          }

          dragState.current = null;
          setDragging(false);
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(255,255,255,0.96),transparent_28%),radial-gradient(circle_at_86%_10%,rgba(235,224,205,0.52),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.58),rgba(249,246,239,0.84))]" />
        <div className="absolute right-5 top-5 z-20 flex items-center gap-2">
          <button
            type="button"
            data-graph-control="true"
            onClick={(event) => {
              event.stopPropagation();
              zoomBy(1 / 1.16);
            }}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-grain bg-paper/92 text-[22px] text-ink shadow-[0_12px_26px_rgba(40,38,34,0.08)] transition-colors hover:border-ink/30"
            aria-label="축소"
          >
            -
          </button>
          <button
            type="button"
            data-graph-control="true"
            onClick={(event) => {
              event.stopPropagation();
              resetView();
            }}
            className="flex h-11 min-w-[78px] cursor-pointer items-center justify-center rounded-full border border-grain bg-paper/92 px-4 font-mono text-[12px] text-ink shadow-[0_12px_26px_rgba(40,38,34,0.08)] transition-colors hover:border-ink/30"
            aria-label="배율 초기화"
          >
            {Math.round(view.scale * 100)}%
          </button>
          <button
            type="button"
            data-graph-control="true"
            onClick={(event) => {
              event.stopPropagation();
              zoomBy(1.16);
            }}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-grain bg-paper/92 text-[22px] text-ink shadow-[0_12px_26px_rgba(40,38,34,0.08)] transition-colors hover:border-ink/30"
            aria-label="확대"
          >
            +
          </button>
        </div>
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: sceneWidth,
            height: sceneHeight,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          <svg
            width={sceneWidth}
            height={sceneHeight}
            className="absolute left-0 top-0 overflow-visible"
          >
            <g pointerEvents="none">
              {lanes.map((lane) => (
                <g key={lane.subject}>
                  <rect
                    x={146}
                    y={lane.y}
                    width={sceneWidth - 210}
                    height={lane.height}
                    rx={28}
                    fill="rgba(255,253,248,0.42)"
                    stroke="rgba(188,175,154,0.72)"
                    strokeWidth="1"
                  />
                  <text
                    x={150}
                    y={lane.y + lane.height / 2 + 8}
                    fill="#1f1a15"
                    fontFamily="var(--font-display, serif)"
                    fontSize="26"
                    textAnchor="end"
                  >
                    {lane.subject}
                  </text>
                </g>
              ))}

              {stages.map((stage) => (
                <g key={stage.key}>
                  <rect
                    x={stage.x}
                    y={20}
                    width={stage.width}
                    height={74}
                    rx={26}
                    fill="rgba(255,253,248,0.54)"
                    stroke="rgba(188,175,154,0.72)"
                    strokeWidth="1"
                  />
                  <text
                    x={stage.x + stage.width / 2}
                    y={43}
                    fill="#8f7f68"
                    fontFamily="var(--font-mono, monospace)"
                    fontSize="10"
                    letterSpacing="1.8"
                    textAnchor="middle"
                  >
                    {stage.schoolLevel}
                  </text>
                  <text
                    x={stage.x + stage.width / 2}
                    y={73}
                    fill="#1f1a15"
                    fontFamily="var(--font-display, serif)"
                    fontSize="24"
                    textAnchor="middle"
                  >
                    {stage.label}
                  </text>
                </g>
              ))}

              {current && nodeById.get(current.id) && (
                <ellipse
                  cx={nodeById.get(current.id)!.x + nodeById.get(current.id)!.width / 2}
                  cy={nodeById.get(current.id)!.y + nodeById.get(current.id)!.height / 2}
                  rx={140}
                  ry={92}
                  fill="rgba(28,25,19,0.06)"
                />
              )}

            </g>
            <g pointerEvents="none">
            {relations.map((relation) => {
              const source = nodeById.get(relation.sourceId);
              const target = nodeById.get(relation.targetId);
              if (!source || !target) return null;

              const startX = source.x + source.width;
              const startY = source.y + source.height / 2;
              const endX = target.x;
              const endY = target.y + target.height / 2;
              const horizontalGap = Math.max(72, (endX - startX) * 0.46);
              const isFocusEdge = Boolean(current && (relation.sourceId === current.id || relation.targetId === current.id));

              return (
                <path
                  key={`${relation.sourceId}-${relation.targetId}`}
                  d={`M ${startX} ${startY} C ${startX + horizontalGap} ${startY}, ${endX - horizontalGap} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke={isFocusEdge ? 'rgba(28,25,19,0.42)' : 'rgba(107,91,73,0.18)'}
                  strokeWidth={isFocusEdge ? 2.3 : 1.35}
                  strokeLinecap="round"
                />
              );
            })}
            </g>
            <g>
              {nodes.map(renderNode)}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeMap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const conceptIdParam = searchParams.get('conceptId')?.trim().toUpperCase() ?? '';
  const questionIdParam = searchParams.get('questionId')?.trim() ?? '';
  const [mode, setMode] = useState<SourceMode>(questionIdParam ? 'question' : 'concept');
  const [inputValue, setInputValue] = useState(questionIdParam || conceptIdParam || DEFAULT_CONCEPT_ID);
  const [graph, setGraph] = useState<KnowledgeMapGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode(questionIdParam ? 'question' : 'concept');
    setInputValue(questionIdParam || conceptIdParam || DEFAULT_CONCEPT_ID);
  }, [conceptIdParam, questionIdParam]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        if (questionIdParam) {
          const questionId = Number(questionIdParam);
          if (!Number.isInteger(questionId) || questionId <= 0) {
            throw new Error('유효한 문항 ID를 입력해 주세요.');
          }

          const nextGraph = await fetchQuestionCurriculumGraph(questionId);
          if (!cancelled) setGraph(nextGraph);
          return;
        }

        const conceptId = (conceptIdParam || DEFAULT_CONCEPT_ID).toUpperCase();
        const nextGraph = await fetchCurriculumGraph(conceptId);
        if (!cancelled) setGraph(nextGraph);
      } catch (nextError) {
        if (cancelled) return;
        setGraph(null);
        setError(nextError instanceof Error ? nextError.message : '개념 지도를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [conceptIdParam, questionIdParam]);

  const submitInput = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextValue = inputValue.trim();

    if (mode === 'question') {
      if (!nextValue) {
        setError('문항 ID를 입력해 주세요.');
        return;
      }
      setSearchParams({ questionId: nextValue });
      return;
    }

    setSearchParams({ conceptId: (nextValue || DEFAULT_CONCEPT_ID).toUpperCase() });
  };

  const focusConcept = (conceptId: string) => {
    setMode('concept');
    setSearchParams({ conceptId });
  };

  const current = graph?.concept ?? null;
  const adjacency = graph ? buildAdjacency(graph.relations) : new Map<string, Set<string>>();
  const directNeighbors = graph && current
    ? graph.concepts.filter((concept) => adjacency.get(current.id)?.has(concept.id)).sort(compareConcepts)
    : [];

  return (
    <div className="min-h-screen bg-paper-grain text-ink">
      <Navbar />
      <main className="mx-auto max-w-[1600px] px-6 pb-20 pt-16 lg:px-10 lg:pb-24 lg:pt-20">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Link
                to="/"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
              >
                <span aria-hidden="true">←</span>
                <span>돌아가기</span>
              </Link>
              <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.24em] text-clay-deep">
                Knowledge Graph
              </p>
              <h1 className="mt-4 font-display text-[48px] leading-[0.98] tracking-tight-display text-ink lg:text-[72px]">
                전체 개념 연결 지도
              </h1>
              <p className="mt-5 max-w-3xl font-display text-[18px] leading-[1.6] text-ink-muted">
                모든 단원 노드를 한 화면에 배치하고, 선수 관계선을 전부 표시합니다. 현재 개념은 강조만 주고, 전체 구조 안에서 어디에 놓여 있는지 바로 읽을 수 있게 했습니다.
              </p>
            </div>

            <div className="w-full max-w-[520px] rounded-[30px] border border-grain bg-paper/86 p-4 shadow-[0_18px_48px_rgba(38,34,28,0.08)] backdrop-blur-sm">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('concept')}
                  className={`flex-1 rounded-full px-4 py-3 text-[13px] transition-colors ${
                    mode === 'concept' ? 'bg-ink text-paper' : 'bg-grain-soft text-ink-muted hover:bg-grain'
                  }`}
                >
                  개념 ID
                </button>
                <button
                  type="button"
                  onClick={() => setMode('question')}
                  className={`flex-1 rounded-full px-4 py-3 text-[13px] transition-colors ${
                    mode === 'question' ? 'bg-ink text-paper' : 'bg-grain-soft text-ink-muted hover:bg-grain'
                  }`}
                >
                  문항 ID
                </button>
              </div>

              <form onSubmit={submitInput} className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder={mode === 'concept' ? '예: D29' : '예: 120'}
                  className="h-12 flex-1 rounded-full border border-grain bg-paper px-5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-ink/40"
                />
                <button
                  type="submit"
                  className="h-12 cursor-pointer rounded-full bg-ink px-6 text-[13px] font-medium text-paper transition-colors hover:bg-ink-soft"
                >
                  불러오기
                </button>
              </form>

              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_CONCEPT_IDS.map((conceptId) => (
                  <button
                    key={conceptId}
                    type="button"
                    onClick={() => {
                      setMode('concept');
                      setSearchParams({ conceptId });
                    }}
                    className="cursor-pointer rounded-full border border-grain bg-paper px-3 py-1.5 font-mono text-[11px] text-ink-muted transition-colors hover:border-ink/30 hover:text-ink"
                  >
                    {conceptId}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0">
              {loading ? (
                <div className="flex min-h-[720px] items-center justify-center rounded-[36px] border border-grain bg-paper/86">
                  <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-ink-muted">
                    전체 개념 그래프를 불러오는 중입니다
                  </p>
                </div>
              ) : error ? (
                <div className="rounded-[36px] border border-[#e8b8b1] bg-[#fff6f4] p-8">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#b14a3d]">
                    Load Error
                  </p>
                  <p className="mt-4 text-[16px] leading-[1.6] text-[#7d3a30]">
                    {error}
                  </p>
                </div>
              ) : graph ? (
                <KnowledgeGraph graph={graph} onSelectConcept={focusConcept} />
              ) : null}
            </section>

            <aside className="space-y-4">
              <div className="rounded-[28px] border border-grain bg-paper/88 p-6 shadow-[0_14px_38px_rgba(40,38,34,0.06)]">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay-deep">
                  현재 포커스
                </p>
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-grain bg-grain-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-clay-deep">
                      {current?.id ?? '-'}
                    </span>
                    {graph?.question && (
                      <span className="rounded-full border border-grain bg-paper px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                        문항 {graph.question.id}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-4 font-display text-[28px] leading-[1.1] tracking-tight-display text-ink">
                    {current?.curriculum.at(-1) ?? '개념을 선택해 주세요'}
                  </h2>
                  <p className="mt-3 text-[14px] leading-[1.7] text-ink-muted">
                    {current ? `${current.schoolLevel} ${current.grade} · ${current.subject}` : '현재 선택된 개념이 없습니다.'}
                  </p>
                </div>
                {graph?.question && (
                  <p className="mt-5 rounded-[20px] bg-grain-soft px-4 py-3 text-[13px] leading-[1.7] text-ink-muted">
                    문항 {graph.question.id}가 가리키는 개념을 중심으로 전체 그래프를 강조했습니다.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-[24px] border border-grain bg-paper/88 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-clay-deep">
                    전체 노드
                  </p>
                  <p className="mt-3 font-display text-[34px] leading-none tracking-tight-display text-ink">
                    {graph?.concepts.length ?? 0}
                  </p>
                </div>
                <div className="rounded-[24px] border border-grain bg-paper/88 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-clay-deep">
                    전체 관계선
                  </p>
                  <p className="mt-3 font-display text-[34px] leading-none tracking-tight-display text-ink">
                    {graph?.relations.length ?? 0}
                  </p>
                </div>
                <div className="rounded-[24px] border border-grain bg-paper/88 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-clay-deep">
                    직접 연결
                  </p>
                  <p className="mt-3 font-display text-[34px] leading-none tracking-tight-display text-ink">
                    {directNeighbors.length}
                  </p>
                </div>
              </div>

              <div className="rounded-[28px] border border-grain bg-paper/88 p-6 shadow-[0_14px_38px_rgba(40,38,34,0.06)]">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay-deep">
                  직접 연결 개념
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {directNeighbors.length > 0 ? (
                    directNeighbors.map((concept) => (
                      <button
                        key={concept.id}
                        type="button"
                        onClick={() => focusConcept(concept.id)}
                        className="cursor-pointer rounded-full border border-grain bg-paper px-3 py-2 text-left transition-colors hover:border-ink/30"
                      >
                        <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-clay-deep">
                          {concept.id}
                        </span>
                        <span className="mt-1 block max-w-[240px] text-[12px] leading-[1.5] text-ink-muted">
                          {concept.curriculum.at(-1)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="text-[13px] leading-[1.7] text-ink-muted">
                      현재 개념과 직접 연결된 다른 노드가 없습니다.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-grain bg-paper/88 p-6 shadow-[0_14px_38px_rgba(40,38,34,0.06)]">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay-deep">
                  읽는 법
                </p>
                <div className="mt-4 space-y-3 text-[13px] leading-[1.7] text-ink-muted">
                  <p>가로축은 학년과 과정, 세로축은 수학 영역입니다.</p>
                  <p>검은 카드는 현재 포커스, 베이지 카드는 현재 개념과 직접 연결된 노드입니다.</p>
                  <p>모든 선수 관계선을 깔아 두었고, 현재 개념과 맞닿은 선만 더 진하게 표시합니다.</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
