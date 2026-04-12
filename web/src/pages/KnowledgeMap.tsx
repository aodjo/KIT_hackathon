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

type RoutePoint = {
  x: number;
  y: number;
};

type CubicSegment = {
  start: RoutePoint;
  control1: RoutePoint;
  control2: RoutePoint;
  end: RoutePoint;
};

type RelationRouteMeta = {
  offset: number;
};

type AnchorSide = 'left' | 'right' | 'top' | 'bottom';

type NodeAnchor = {
  normal: RoutePoint;
  point: RoutePoint;
  side: AnchorSide;
};

type TextBlockLayout = {
  lines: string[];
  fontSize: number;
  lineHeight: number;
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

function wrapTextAll(text: string, maxChars: number) {
  const chars = Array.from(text.trim());
  if (chars.length === 0) return [];

  const lines: string[] = [];
  let index = 0;

  while (index < chars.length) {
    const remaining = chars.length - index;
    const take = Math.min(maxChars, remaining);
    lines.push(chars.slice(index, index + take).join(''));
    index += take;
  }

  return lines;
}

function fitTextBlock({
  text,
  width,
  availableHeight,
  maxFontSize,
  minFontSize,
  maxLines,
  requireAllText = false,
}: {
  text: string;
  width: number;
  availableHeight: number;
  maxFontSize: number;
  minFontSize: number;
  maxLines?: number;
  requireAllText?: boolean;
}): TextBlockLayout {
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 0.4) {
    const maxChars = Math.max(4, Math.floor(width / (fontSize * 0.82)));
    const lines = requireAllText
      ? wrapTextAll(text, maxChars)
      : wrapText(text, maxChars, maxLines ?? Number.MAX_SAFE_INTEGER);
    const lineHeight = fontSize * (requireAllText ? 1.16 : 1.22);

    if (lines.length * lineHeight <= availableHeight) {
      return {
        lines,
        fontSize: Number(fontSize.toFixed(1)),
        lineHeight: Number(lineHeight.toFixed(1)),
      };
    }
  }

  const fallbackChars = Math.max(4, Math.floor(width / (minFontSize * 0.82)));
  const fallbackLines = requireAllText
    ? wrapTextAll(text, fallbackChars)
    : wrapText(text, fallbackChars, maxLines ?? Number.MAX_SAFE_INTEGER);

  return {
    lines: fallbackLines,
    fontSize: minFontSize,
    lineHeight: Number((minFontSize * (requireAllText ? 1.16 : 1.22)).toFixed(1)),
  };
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

function getRelationKey(relation: Pick<CurriculumRelation, 'sourceId' | 'targetId'>) {
  return `${relation.sourceId}->${relation.targetId}`;
}

function getCenteredOffset(index: number, count: number, step: number) {
  return (index - (count - 1) / 2) * step;
}

function buildRelationRouteMeta(
  relations: CurriculumRelation[],
  nodeById: Map<string, LayoutNode>,
) {
  const sourceBuckets = new Map<string, CurriculumRelation[]>();
  const targetBuckets = new Map<string, CurriculumRelation[]>();
  const offsetByKey = new Map<string, number>();

  relations.forEach((relation) => {
    const sourceBucket = sourceBuckets.get(relation.sourceId) ?? [];
    sourceBucket.push(relation);
    sourceBuckets.set(relation.sourceId, sourceBucket);

    const targetBucket = targetBuckets.get(relation.targetId) ?? [];
    targetBucket.push(relation);
    targetBuckets.set(relation.targetId, targetBucket);
  });

  sourceBuckets.forEach((bucket) => {
    bucket
      .sort((left, right) => {
        const leftNode = nodeById.get(left.targetId);
        const rightNode = nodeById.get(right.targetId);
        if (!leftNode || !rightNode) return 0;
        if (leftNode.x !== rightNode.x) return leftNode.x - rightNode.x;
        return leftNode.y - rightNode.y;
      })
      .forEach((relation, index) => {
        const key = getRelationKey(relation);
        offsetByKey.set(key, (offsetByKey.get(key) ?? 0) + getCenteredOffset(index, bucket.length, 16));
      });
  });

  targetBuckets.forEach((bucket) => {
    bucket
      .sort((left, right) => {
        const leftNode = nodeById.get(left.sourceId);
        const rightNode = nodeById.get(right.sourceId);
        if (!leftNode || !rightNode) return 0;
        if (leftNode.x !== rightNode.x) return leftNode.x - rightNode.x;
        return leftNode.y - rightNode.y;
      })
      .forEach((relation, index) => {
        const key = getRelationKey(relation);
        offsetByKey.set(key, (offsetByKey.get(key) ?? 0) + getCenteredOffset(index, bucket.length, 14));
      });
  });

  return new Map<string, RelationRouteMeta>(
    relations.map((relation) => {
      const key = getRelationKey(relation);
      return [key, { offset: clamp(offsetByKey.get(key) ?? 0, -42, 42) }];
    }),
  );
}

function buildCubicPath(segment: CubicSegment) {
  return `M ${segment.start.x} ${segment.start.y} C ${segment.control1.x} ${segment.control1.y}, ${segment.control2.x} ${segment.control2.y}, ${segment.end.x} ${segment.end.y}`;
}

function sampleCubicSegment(segment: CubicSegment, t: number): RoutePoint {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * segment.start.x
      + 3 * mt2 * t * segment.control1.x
      + 3 * mt * t2 * segment.control2.x
      + t3 * segment.end.x,
    y: mt3 * segment.start.y
      + 3 * mt2 * t * segment.control1.y
      + 3 * mt * t2 * segment.control2.y
      + t3 * segment.end.y,
  };
}

function pointIntersectsNode(point: RoutePoint, node: LayoutNode, padding = 6) {
  return (
    point.x >= node.x - padding
    && point.x <= node.x + node.width + padding
    && point.y >= node.y - padding
    && point.y <= node.y + node.height + padding
  );
}

function collectBlockingNodes(
  segment: CubicSegment,
  nodes: LayoutNode[],
  sourceId: string,
  targetId: string,
  padding = 6,
) {
  const blockers = new Map<string, LayoutNode>();

  for (let index = 1; index < 20; index += 1) {
    const point = sampleCubicSegment(segment, index / 20);
    nodes.forEach((node) => {
      if (node.concept.id === sourceId || node.concept.id === targetId) return;
      if (pointIntersectsNode(point, node, padding)) blockers.set(node.concept.id, node);
    });
  }

  return Array.from(blockers.values());
}

function getNodeCenter(node: LayoutNode): RoutePoint {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
}

function getNodeAnchor(node: LayoutNode, side: AnchorSide, offset: number): NodeAnchor {
  const center = getNodeCenter(node);
  const verticalInset = 18;
  const horizontalInset = 22;

  switch (side) {
    case 'left':
      return {
        side,
        point: {
          x: node.x,
          y: clamp(center.y + offset, node.y + verticalInset, node.y + node.height - verticalInset),
        },
        normal: { x: -1, y: 0 },
      };
    case 'right':
      return {
        side,
        point: {
          x: node.x + node.width,
          y: clamp(center.y + offset, node.y + verticalInset, node.y + node.height - verticalInset),
        },
        normal: { x: 1, y: 0 },
      };
    case 'top':
      return {
        side,
        point: {
          x: clamp(center.x + offset, node.x + horizontalInset, node.x + node.width - horizontalInset),
          y: node.y,
        },
        normal: { x: 0, y: -1 },
      };
    case 'bottom':
      return {
        side,
        point: {
          x: clamp(center.x + offset, node.x + horizontalInset, node.x + node.width - horizontalInset),
          y: node.y + node.height,
        },
        normal: { x: 0, y: 1 },
      };
  }
}

function getOppositeVerticalSide(side: AnchorSide) {
  return side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : side;
}

function getCandidateSides(
  node: LayoutNode,
  otherNode: LayoutNode,
  role: 'source' | 'target',
  forward: boolean,
): AnchorSide[] {
  const nodeCenter = getNodeCenter(node);
  const otherCenter = getNodeCenter(otherNode);
  const dx = otherCenter.x - nodeCenter.x;
  const dy = otherCenter.y - nodeCenter.y;
  const horizontalSide: AnchorSide = role === 'source'
    ? (forward ? 'right' : 'left')
    : (forward ? 'left' : 'right');
  const verticalSide: AnchorSide = dy < 0 ? 'top' : 'bottom';
  const verticalPreferred = Math.abs(dy) > Math.abs(dx) * 0.72;

  return verticalPreferred
    ? [verticalSide, horizontalSide, getOppositeVerticalSide(verticalSide)]
    : [horizontalSide, verticalSide, getOppositeVerticalSide(verticalSide)];
}

function getVectorLength(vector: RoutePoint) {
  return Math.hypot(vector.x, vector.y);
}

function normalizeVector(vector: RoutePoint) {
  const length = getVectorLength(vector) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function offsetPoint(point: RoutePoint, vector: RoutePoint, distance: number): RoutePoint {
  return {
    x: point.x + vector.x * distance,
    y: point.y + vector.y * distance,
  };
}

function buildDirectRelationSegment(
  source: LayoutNode,
  target: LayoutNode,
  forward: boolean,
  offset: number,
  startSide: AnchorSide,
  endSide: AnchorSide,
) {
  const start = getNodeAnchor(source, startSide, offset);
  const end = getNodeAnchor(target, endSide, -offset * 0.75);
  const delta = {
    x: end.point.x - start.point.x,
    y: end.point.y - start.point.y,
  };
  const distance = getVectorLength(delta);
  const controlPull = clamp(distance * 0.28, 28, 112);

  return {
    start: start.point,
    control1: offsetPoint(start.point, start.normal, controlPull),
    control2: offsetPoint(end.point, end.normal, controlPull),
    end: end.point,
  };
}

function buildPathFromCubicSegments(segments: CubicSegment[]) {
  if (segments.length === 0) return '';

  return segments.map((segment, index) => (
    index === 0
      ? `M ${segment.start.x} ${segment.start.y} C ${segment.control1.x} ${segment.control1.y}, ${segment.control2.x} ${segment.control2.y}, ${segment.end.x} ${segment.end.y}`
      : `C ${segment.control1.x} ${segment.control1.y}, ${segment.control2.x} ${segment.control2.y}, ${segment.end.x} ${segment.end.y}`
  )).join(' ');
}

function collectBlockingNodesForSegments(
  segments: CubicSegment[],
  nodes: LayoutNode[],
  sourceId: string,
  targetId: string,
  padding = 6,
) {
  const blockers = new Map<string, LayoutNode>();

  segments.forEach((segment) => {
    collectBlockingNodes(segment, nodes, sourceId, targetId, padding)
      .forEach((node) => blockers.set(node.concept.id, node));
  });

  return Array.from(blockers.values());
}

function estimateSegmentSpan(segment: CubicSegment) {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
}

function buildSoftDetourSegments(
  startAnchor: NodeAnchor,
  endAnchor: NodeAnchor,
  corridorY: number,
) {
  const start = startAnchor.point;
  const end = endAnchor.point;
  const startExitX = start.x + clamp(30 + Math.abs(corridorY - start.y) * 0.18, 28, 72);
  const endEntryX = end.x - clamp(30 + Math.abs(corridorY - end.y) * 0.18, 28, 72);
  const midX = (startExitX + endEntryX) / 2;

  if (endEntryX - startExitX < 36) return [];

  const centerPull = clamp((endEntryX - startExitX) * 0.22, 18, 52);
  const midpoint = { x: midX, y: corridorY };

  return [
    {
      start,
      control1: { x: startExitX, y: start.y },
      control2: { x: midX - centerPull, y: corridorY },
      end: midpoint,
    },
    {
      start: midpoint,
      control1: { x: midX + centerPull, y: corridorY },
      control2: { x: endEntryX, y: end.y },
      end,
    },
  ];
}

function getBlockerBounds(blockers: LayoutNode[]) {
  return {
    left: Math.min(...blockers.map((node) => node.x)),
    right: Math.max(...blockers.map((node) => node.x + node.width)),
    top: Math.min(...blockers.map((node) => node.y)),
    bottom: Math.max(...blockers.map((node) => node.y + node.height)),
  };
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(Math.min(startA, endA), Math.min(startB, endB))
    <= Math.min(Math.max(startA, endA), Math.max(startB, endB));
}

function collectAxisAlignedSegmentBlockers(
  start: RoutePoint,
  end: RoutePoint,
  nodes: LayoutNode[],
  sourceId: string,
  targetId: string,
  padding = 8,
) {
  const blockers = new Map<string, LayoutNode>();
  const horizontal = Math.abs(start.y - end.y) < 0.5;
  const vertical = Math.abs(start.x - end.x) < 0.5;

  if (!horizontal && !vertical) return [];

  nodes.forEach((node) => {
    if (node.concept.id === sourceId || node.concept.id === targetId) return;

    const left = node.x - padding;
    const right = node.x + node.width + padding;
    const top = node.y - padding;
    const bottom = node.y + node.height + padding;

    if (horizontal) {
      if (start.y >= top && start.y <= bottom && rangesOverlap(start.x, end.x, left, right)) {
        blockers.set(node.concept.id, node);
      }
      return;
    }

    if (start.x >= left && start.x <= right && rangesOverlap(start.y, end.y, top, bottom)) {
      blockers.set(node.concept.id, node);
    }
  });

  return Array.from(blockers.values());
}

function collapseRoutePoints(points: RoutePoint[]) {
  const deduped = points.filter((point, index, list) => {
    if (index === 0) return true;
    const previous = list[index - 1];
    return Math.abs(previous.x - point.x) > 0.5 || Math.abs(previous.y - point.y) > 0.5;
  });

  const collapsed: RoutePoint[] = [];

  deduped.forEach((point) => {
    if (collapsed.length < 2) {
      collapsed.push(point);
      return;
    }

    const previous = collapsed[collapsed.length - 1];
    const beforePrevious = collapsed[collapsed.length - 2];
    const sameVertical = Math.abs(beforePrevious.x - previous.x) < 0.5 && Math.abs(previous.x - point.x) < 0.5;
    const sameHorizontal = Math.abs(beforePrevious.y - previous.y) < 0.5 && Math.abs(previous.y - point.y) < 0.5;

    if (sameVertical || sameHorizontal) {
      collapsed[collapsed.length - 1] = point;
      return;
    }

    collapsed.push(point);
  });

  return collapsed;
}

function collectPolylineBlockers(
  points: RoutePoint[],
  nodes: LayoutNode[],
  sourceId: string,
  targetId: string,
) {
  const blockers = new Map<string, LayoutNode>();

  for (let index = 1; index < points.length; index += 1) {
    collectAxisAlignedSegmentBlockers(points[index - 1], points[index], nodes, sourceId, targetId)
      .forEach((node) => blockers.set(node.concept.id, node));
  }

  return Array.from(blockers.values());
}

function getPolylineLength(points: RoutePoint[]) {
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }

  return length;
}

function buildRoundedPolylinePath(points: RoutePoint[], baseRadius: number) {
  if (points.length < 2) return '';

  const collapsed = collapseRoutePoints(points);
  if (collapsed.length < 2) return '';

  let path = `M ${collapsed[0].x} ${collapsed[0].y}`;

  for (let index = 1; index < collapsed.length; index += 1) {
    const current = collapsed[index];

    if (index === collapsed.length - 1) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const previous = collapsed[index - 1];
    const next = collapsed[index + 1];
    const incoming = {
      x: current.x - previous.x,
      y: current.y - previous.y,
    };
    const outgoing = {
      x: next.x - current.x,
      y: next.y - current.y,
    };
    const incomingLength = getVectorLength(incoming);
    const outgoingLength = getVectorLength(outgoing);

    if (incomingLength < 1 || outgoingLength < 1) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const incomingUnit = normalizeVector(incoming);
    const outgoingUnit = normalizeVector(outgoing);
    const aligned = Math.abs(incomingUnit.x - outgoingUnit.x) < 0.001
      && Math.abs(incomingUnit.y - outgoingUnit.y) < 0.001;

    if (aligned) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const radius = Math.min(baseRadius, incomingLength / 2, outgoingLength / 2);
    const cornerStart = {
      x: current.x - incomingUnit.x * radius,
      y: current.y - incomingUnit.y * radius,
    };
    const cornerEnd = {
      x: current.x + outgoingUnit.x * radius,
      y: current.y + outgoingUnit.y * radius,
    };

    path += ` L ${cornerStart.x} ${cornerStart.y}`;
    path += ` Q ${current.x} ${current.y}, ${cornerEnd.x} ${cornerEnd.y}`;
  }

  return path;
}

function buildSmoothCorridorPath(points: RoutePoint[]) {
  const collapsed = collapseRoutePoints(points);
  if (collapsed.length < 4) return '';

  const start = collapsed[0];
  const startPort = collapsed[1];
  const risePoint = collapsed[2];
  const dropPoint = collapsed[collapsed.length - 3];
  const endPort = collapsed[collapsed.length - 2];
  const end = collapsed[collapsed.length - 1];

  const hasHorizontalPorts = Math.abs(start.y - startPort.y) < 0.5
    && Math.abs(end.y - endPort.y) < 0.5;
  const hasVerticalLift = Math.abs(risePoint.x - startPort.x) < 0.5
    && Math.abs(dropPoint.x - endPort.x) < 0.5;
  const sameCorridor = Math.abs(risePoint.y - dropPoint.y) < 0.5;

  if (!hasHorizontalPorts || !hasVerticalLift || !sameCorridor) {
    return '';
  }

  const corridorY = risePoint.y;
  const liftAmount = Math.abs(corridorY - startPort.y);
  const corridorWidth = endPort.x - startPort.x;

  if (corridorWidth <= 24) return '';
  if (liftAmount < 1) {
    return `M ${start.x} ${start.y} L ${startPort.x} ${startPort.y} L ${endPort.x} ${endPort.y} L ${end.x} ${end.y}`;
  }

  const maxSweep = Math.max(16, corridorWidth / 2 - 14);
  const baseSweep = Math.min(maxSweep, 84, liftAmount * 1.18 + 20);
  const entryEndX = Math.min(startPort.x + baseSweep, endPort.x - 28);
  const exitStartX = Math.max(endPort.x - baseSweep, startPort.x + 28);

  if (exitStartX <= entryEndX + 12) {
    return '';
  }

  const entryControlSpan = entryEndX - startPort.x;
  const exitControlSpan = endPort.x - exitStartX;
  const entryEnd = { x: entryEndX, y: corridorY };
  const exitStart = { x: exitStartX, y: corridorY };

  return [
    `M ${start.x} ${start.y}`,
    `L ${startPort.x} ${startPort.y}`,
    `C ${startPort.x + entryControlSpan * 0.42} ${startPort.y}, ${startPort.x + entryControlSpan * 0.64} ${corridorY}, ${entryEnd.x} ${entryEnd.y}`,
    `L ${exitStart.x} ${exitStart.y}`,
    `C ${exitStart.x + exitControlSpan * 0.36} ${corridorY}, ${exitStart.x + exitControlSpan * 0.58} ${endPort.y}, ${endPort.x} ${endPort.y}`,
    `L ${end.x} ${end.y}`,
  ].join(' ');
}

function buildLocalDetourPath(
  sourceId: string,
  targetId: string,
  nodes: LayoutNode[],
  offset: number,
  blockers: LayoutNode[],
  startAnchor: NodeAnchor,
  endAnchor: NodeAnchor,
) {
  const start = startAnchor.point;
  const end = endAnchor.point;
  const portDistance = 28 + Math.abs(offset) * 0.18;
  const startPort = offsetPoint(start, startAnchor.normal, portDistance);
  const endPort = offsetPoint(end, endAnchor.normal, portDistance);
  const blockerBounds = getBlockerBounds(blockers);
  const routeSpread = clamp(offset * 0.82, -26, 26);
  const arcMargin = 16 + Math.abs(offset) * 0.22;
  const arcFactors = [0.46, 0.64, 0.84, 1.08, 1.36, 1.72, 2.16, 2.68];
  const arcCandidates = arcFactors.flatMap((factor) => ([
    {
      side: 'top' as const,
      segments: buildSoftDetourSegments(
        startAnchor,
        endAnchor,
        blockerBounds.top - arcMargin * factor + routeSpread,
      ),
    },
    {
      side: 'bottom' as const,
      segments: buildSoftDetourSegments(
        startAnchor,
        endAnchor,
        blockerBounds.bottom + arcMargin * factor + routeSpread,
      ),
    },
  ])).map((candidate) => {
    const candidateBlockers = collectBlockingNodesForSegments(
      candidate.segments,
      nodes,
      sourceId,
      targetId,
      2,
    );
    const routeSign = Math.sign(offset);
    const sidePenalty = routeSign < 0
      ? (candidate.side === 'bottom' ? 28 : 0)
      : routeSign > 0
        ? (candidate.side === 'top' ? 28 : 0)
        : 0;
    const spanCost = candidate.segments.reduce((sum, segment) => sum + estimateSegmentSpan(segment), 0);

    return {
      blockers: candidateBlockers,
      path: buildPathFromCubicSegments(candidate.segments),
      sidePenalty,
      spanCost,
    };
  }).filter((candidate) => candidate.path.length > 0)
    .sort((left, right) => (
      left.blockers.length * 1000
      + left.sidePenalty
      + left.spanCost * 0.08
    ) - (
      right.blockers.length * 1000
      + right.sidePenalty
      + right.spanCost * 0.08
    ));

  const clearArc = arcCandidates.find((candidate) => candidate.blockers.length === 0);
  if (clearArc) {
    return clearArc.path;
  }
  return arcCandidates[0]?.path ?? buildCubicPath({
    start,
    control1: startPort,
    control2: endPort,
    end,
  });
}

function buildRelationPath(
  source: LayoutNode,
  target: LayoutNode,
  stages: LayoutStage[],
  lanes: LayoutLane[],
  nodes: LayoutNode[],
  routeMeta: RelationRouteMeta,
) {
  const sourceStageIndex = STAGE_INDEX.get(source.stageKey) ?? -1;
  const targetStageIndex = STAGE_INDEX.get(target.stageKey) ?? -1;
  const sourceStage = stages.find((stage) => stage.key === source.stageKey);
  const targetStage = stages.find((stage) => stage.key === target.stageKey);

  if (!sourceStage || !targetStage || sourceStageIndex === -1 || targetStageIndex === -1) {
    return '';
  }

  const routeOffset = routeMeta.offset;
  const startAnchor = getNodeAnchor(source, 'right', routeOffset);
  const endAnchor = getNodeAnchor(target, 'left', -routeOffset * 0.75);
  const segment = buildDirectRelationSegment(source, target, true, routeOffset, 'right', 'left');
  const blockers = collectBlockingNodes(segment, nodes, source.concept.id, target.concept.id);

  if (blockers.length === 0) return buildCubicPath(segment);

  return buildLocalDetourPath(
    source.concept.id,
    target.concept.id,
    nodes,
    routeOffset,
    blockers,
    startAnchor,
    endAnchor,
  );
}

function buildRelationMaps(relations: CurriculumRelation[]) {
  const incoming = new Map<string, CurriculumRelation[]>();
  const outgoing = new Map<string, CurriculumRelation[]>();

  relations.forEach((relation) => {
    const parentBucket = incoming.get(relation.targetId) ?? [];
    parentBucket.push(relation);
    incoming.set(relation.targetId, parentBucket);

    const childBucket = outgoing.get(relation.sourceId) ?? [];
    childBucket.push(relation);
    outgoing.set(relation.sourceId, childBucket);
  });

  return { incoming, outgoing };
}

function collectLineageSubgraph(
  currentId: string | null | undefined,
  relations: CurriculumRelation[],
) {
  const ancestorIds = new Set<string>();
  const descendantIds = new Set<string>();
  const directParentIds = new Set<string>();
  const directChildIds = new Set<string>();
  const highlightedEdgeKeys = new Set<string>();

  if (!currentId) {
    return {
      ancestorIds,
      descendantIds,
      directParentIds,
      directChildIds,
      highlightedEdgeKeys,
    };
  }

  const { incoming, outgoing } = buildRelationMaps(relations);
  const visitedAncestors = new Set<string>();
  const visitedDescendants = new Set<string>();

  const visitAncestors = (nodeId: string, depth: number) => {
    if (visitedAncestors.has(nodeId)) return;
    visitedAncestors.add(nodeId);

    const parents = incoming.get(nodeId) ?? [];
    parents.forEach((relation) => {
      ancestorIds.add(relation.sourceId);
      highlightedEdgeKeys.add(getRelationKey(relation));
      if (depth === 0) directParentIds.add(relation.sourceId);
      visitAncestors(relation.sourceId, depth + 1);
    });
  };

  const visitDescendants = (nodeId: string, depth: number) => {
    if (visitedDescendants.has(nodeId)) return;
    visitedDescendants.add(nodeId);

    const children = outgoing.get(nodeId) ?? [];
    children.forEach((relation) => {
      descendantIds.add(relation.targetId);
      highlightedEdgeKeys.add(getRelationKey(relation));
      if (depth === 0) directChildIds.add(relation.targetId);
      visitDescendants(relation.targetId, depth + 1);
    });
  };

  visitAncestors(currentId, 0);
  visitDescendants(currentId, 0);

  return {
    ancestorIds,
    descendantIds,
    directParentIds,
    directChildIds,
    highlightedEdgeKeys,
  };
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
  const relationRouteMeta = buildRelationRouteMeta(relations, nodeById);
  const adjacency = buildAdjacency(relations);
  const current = graph.concept;
  const {
    ancestorIds,
    descendantIds,
    directParentIds,
    directChildIds,
    highlightedEdgeKeys,
  } = collectLineageSubgraph(current?.id, relations);
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
    const isAncestor = ancestorIds.has(node.concept.id);
    const isDescendant = descendantIds.has(node.concept.id);
    const isDirectParent = directParentIds.has(node.concept.id);
    const isDirectChild = directChildIds.has(node.concept.id);
    const isHighlighted = isCurrent || isAncestor || isDescendant;
    const title = node.concept.curriculum.at(-1) ?? node.concept.id;
    const contextText = `${node.concept.schoolLevel} ${node.concept.grade} · ${node.concept.subject}`;
    const detailText = node.concept.curriculum.join(', ');
    const directCount = adjacency.get(node.concept.id)?.size ?? 0;
    const background = isCurrent
      ? '#1c1913'
      : isDirectParent || isDirectChild
        ? '#eadac0'
        : isHighlighted
          ? 'rgba(241,232,217,0.96)'
          : 'rgba(255, 253, 248, 0.96)';
    const stroke = isCurrent
      ? '#1c1913'
      : isHighlighted
        ? 'rgba(140,111,79,0.48)'
        : 'rgba(188,175,154,0.9)';
    const titleFill = isCurrent ? 'rgba(255,250,240,0.96)' : '#1f1a15';
    const metaFill = isCurrent ? 'rgba(255,250,240,0.68)' : isHighlighted ? '#6d5639' : '#8f7f68';
    const bodyText = zoomMode === 'detail' ? detailText : title;
    let contextVisible = zoomMode !== 'overview';
    let detailVisible = zoomMode === 'detail';
    let bodyY = contextVisible ? node.y + 50 : node.y + 42;
    let bodyBottomY = detailVisible ? node.y + node.height - 24 : node.y + node.height - 14;
    let bodyLayout = fitTextBlock({
      text: bodyText,
      width: node.width - 28,
      availableHeight: Math.max(18, bodyBottomY - bodyY),
      maxFontSize: zoomMode === 'overview' ? 12.5 : zoomMode === 'context' ? 13.2 : 12.6,
      minFontSize: zoomMode === 'overview' ? 10.2 : zoomMode === 'context' ? 9.6 : 6.2,
      maxLines: zoomMode === 'overview' ? 2 : zoomMode === 'context' ? 3 : undefined,
      requireAllText: zoomMode === 'detail',
    });

    if (zoomMode === 'detail' && bodyLayout.lines.length * bodyLayout.lineHeight > bodyBottomY - bodyY) {
      detailVisible = false;
      bodyBottomY = node.y + node.height - 14;
      bodyLayout = fitTextBlock({
        text: bodyText,
        width: node.width - 28,
        availableHeight: Math.max(18, bodyBottomY - bodyY),
        maxFontSize: 12.6,
        minFontSize: 6.2,
        requireAllText: true,
      });
    }

    if (zoomMode === 'detail' && bodyLayout.lines.length * bodyLayout.lineHeight > bodyBottomY - bodyY && contextVisible) {
      contextVisible = false;
      bodyY = node.y + 38;
      bodyLayout = fitTextBlock({
        text: bodyText,
        width: node.width - 28,
        availableHeight: Math.max(18, bodyBottomY - bodyY),
        maxFontSize: 12.6,
        minFontSize: 6.2,
        requireAllText: true,
      });
    }

    const contextFontSize = zoomMode === 'detail' ? 8.1 : 9;
    const contextLabel = ellipsize(contextText, Math.max(14, Math.floor((node.width - 28) / (contextFontSize * 0.8))));

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
          fontSize={zoomMode === 'detail' ? 9.2 : 10}
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
            fontSize={contextFontSize}
          >
            {contextLabel}
          </text>
        )}
        <text
          x={node.x + 14}
          y={bodyY}
          fill={titleFill}
          fontFamily="var(--font-display, serif)"
          fontSize={bodyLayout.fontSize}
        >
          {bodyLayout.lines.map((line, index) => (
            <tspan
              key={`${node.concept.id}-line-${index}`}
              x={node.x + 14}
              dy={index === 0 ? 0 : bodyLayout.lineHeight}
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
            fontSize="8.1"
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

              const path = buildRelationPath(
                source,
                target,
                stages,
                lanes,
                nodes,
                relationRouteMeta.get(getRelationKey(relation)) ?? { offset: 0 },
              );
              if (!path) return null;
              const isHighlightedEdge = highlightedEdgeKeys.has(getRelationKey(relation));
              const isDirectEdge = Boolean(current && (
                (relation.targetId === current.id && directParentIds.has(relation.sourceId))
                || (relation.sourceId === current.id && directChildIds.has(relation.targetId))
              ));

              return (
                <path
                  key={`${relation.sourceId}-${relation.targetId}`}
                  d={path}
                  fill="none"
                  stroke={
                    isDirectEdge
                      ? 'rgba(28,25,19,0.52)'
                      : isHighlightedEdge
                        ? 'rgba(133,99,62,0.4)'
                        : 'rgba(107,91,73,0.18)'
                  }
                  strokeWidth={isDirectEdge ? 2.7 : isHighlightedEdge ? 2.1 : 1.35}
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
  const [inputValue, setInputValue] = useState(conceptIdParam || DEFAULT_CONCEPT_ID);
  const [graph, setGraph] = useState<KnowledgeMapGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (conceptIdParam) {
      setInputValue(conceptIdParam);
    } else if (!questionIdParam) {
      setInputValue(DEFAULT_CONCEPT_ID);
    }
  }, [conceptIdParam, questionIdParam]);

  const focusGraphConcept = (conceptId: string) => {
    setGraph((prev) => {
      if (!prev) return prev;
      const nextConcept = prev.concepts.find((concept) => concept.id === conceptId);
      if (!nextConcept) return prev;
      if (prev.concept?.id === nextConcept.id && !prev.question) return prev;
      return {
        ...prev,
        concept: nextConcept,
        question: undefined,
      };
    });
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (questionIdParam) {
          const questionId = Number(questionIdParam);
          if (!Number.isInteger(questionId) || questionId <= 0) {
            throw new Error('유효한 문항 ID를 입력해 주세요.');
          }

          if (graph?.question?.id === questionId) {
            setError(null);
            setLoading(false);
            return;
          }

          setLoading(true);
          setError(null);
          const nextGraph = await fetchQuestionCurriculumGraph(questionId);
          if (!cancelled) {
            setGraph(nextGraph);
            if (nextGraph.concept?.id) {
              setInputValue(nextGraph.concept.id);
            }
          }
          return;
        }

        const conceptId = (conceptIdParam || DEFAULT_CONCEPT_ID).toUpperCase();
        const cachedConcept = graph?.concepts.find((concept) => concept.id === conceptId);

        if (cachedConcept) {
          if (!cancelled) {
            setGraph((prev) => {
              if (!prev) return prev;
              if (prev.concept?.id === cachedConcept.id && !prev.question) return prev;
              return {
                ...prev,
                concept: cachedConcept,
                question: undefined,
              };
            });
            setError(null);
            setLoading(false);
          }
          return;
        }

        if (graph?.concepts.length) {
          throw new Error(`개념 ID ${conceptId}를 찾을 수 없습니다.`);
        }

        setLoading(true);
        setError(null);
        const nextGraph = await fetchCurriculumGraph(conceptId);
        if (!cancelled) setGraph(nextGraph);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : '개념 지도를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [conceptIdParam, graph, questionIdParam]);

  const submitInput = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextValue = inputValue.trim();
    const nextConceptId = (nextValue || DEFAULT_CONCEPT_ID).toUpperCase();
    focusGraphConcept(nextConceptId);
    setSearchParams({ conceptId: nextConceptId });
  };

  const focusConcept = (conceptId: string) => {
    focusGraphConcept(conceptId);
    setSearchParams({ conceptId });
  };

  const current = graph?.concept ?? null;
  const lineageSubgraph = graph ? collectLineageSubgraph(current?.id, graph.relations) : null;
  const highlightedConcepts = graph && lineageSubgraph
    ? graph.concepts
      .filter((concept) => (
        concept.id !== current?.id
        && (lineageSubgraph.ancestorIds.has(concept.id) || lineageSubgraph.descendantIds.has(concept.id))
      ))
      .sort(compareConcepts)
    : [];

  return (
    <div className="min-h-screen bg-paper-grain text-ink">
      <Navbar />
      <main className="mx-auto max-w-[1600px] px-6 pb-20 pt-16 lg:px-10 lg:pb-24 lg:pt-20">
        <div className="flex flex-col gap-10">
          <div className="max-w-3xl">
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
              <div className="rounded-[28px] border border-grain bg-paper/88 p-4 shadow-[0_14px_38px_rgba(40,38,34,0.06)] backdrop-blur-sm">
                <p className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-clay-deep">
                  그래프 검색
                </p>
                <form onSubmit={submitInput} className="mt-3 flex flex-col gap-3">
                  <input
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    placeholder="예: D29"
                    className="block min-h-[56px] w-full appearance-none rounded-full border border-grain bg-paper px-5 py-4 text-[14px] leading-none text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-ink/40"
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
                        focusGraphConcept(conceptId);
                        setSearchParams({ conceptId });
                      }}
                      className="cursor-pointer rounded-full border border-grain bg-paper px-3 py-1.5 font-mono text-[11px] text-ink-muted transition-colors hover:border-ink/30 hover:text-ink"
                    >
                      {conceptId}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-grain bg-paper/88 p-6 shadow-[0_14px_38px_rgba(40,38,34,0.06)]">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay-deep">
                  선택 개념
                </p>
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-grain bg-grain-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-clay-deep">
                      {current?.id ?? '-'}
                    </span>
                  </div>
                  <h2 className="mt-4 font-display text-[28px] leading-[1.1] tracking-tight-display text-ink">
                    {current
                      ? (current.curriculum.length > 0 ? current.curriculum.join(' · ') : current.id)
                      : '개념을 선택해 주세요'}
                  </h2>
                  <p className="mt-3 text-[14px] leading-[1.7] text-ink-muted">
                    {current ? `${current.schoolLevel} ${current.grade} · ${current.subject}` : '현재 선택된 개념이 없습니다.'}
                  </p>
                </div>
                {graph?.question && (
                  <p className="mt-5 rounded-[20px] bg-grain-soft px-4 py-3 text-[13px] leading-[1.7] text-ink-muted">
                    특정 문항이 가리키는 개념을 중심으로 전체 그래프를 강조했습니다.
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
                    관련 노드
                  </p>
                  <p className="mt-3 font-display text-[34px] leading-none tracking-tight-display text-ink">
                    {highlightedConcepts.length}
                  </p>
                </div>
              </div>

              <div className="rounded-[28px] border border-grain bg-paper/88 p-6 shadow-[0_14px_38px_rgba(40,38,34,0.06)]">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay-deep">
                  관련 개념
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {highlightedConcepts.length > 0 ? (
                    highlightedConcepts.map((concept) => (
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
                      선택 개념과 직접 이어진 선수 또는 후속 개념이 없습니다.
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
                  <p>검은 카드는 선택 개념, 베이지 카드는 그 개념의 선수 경로와 후속 경로입니다.</p>
                  <p>선택 개념의 조상 체인과 하위 서브트리만 강조하고, 상위 개념에서 옆으로 갈라지는 다른 하위 브랜치는 제외합니다.</p>
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
