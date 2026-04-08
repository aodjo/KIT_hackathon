import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, closestCenter, type DragStartEvent, type DragEndEvent, useDroppable, useDraggable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IoIosArrowUp } from 'react-icons/io';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import Navbar from '../components/Navbar';

/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

/** Question record */
type Question = {
  id: number;
  concept_id: string;
  school_level: string;
  domain: string;
  grade: string;
  curriculum_topic: string;
  difficulty: string;
  type: string;
  question: string;
  choices: string | null;
  answer: string;
  explanation: string;
};

/** Topic entry from API */
type TopicEntry = {
  school_level: string;
  grade: string;
  curriculum_topic: string;
  count: number;
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
 * @param props.text raw text with $...$ math
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
 * Sortable question card in workbook panel.
 *
 * @param props.q question data
 * @param props.index display number
 * @param props.onRemove remove callback
 * @return sortable card element
 */
function SortableCard({ q, index, onRemove }: { q: Question; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="border border-grain rounded-lg p-4 bg-paper cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono font-bold text-ink">{index}.</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[q.difficulty] ?? ''}`}>
            {q.difficulty}
          </span>
          <span className="text-[10px] font-mono text-ink-muted">{q.school_level} &gt; {q.grade} &gt; {q.curriculum_topic}</span>
        </div>
        <button
          onClick={onRemove}
          className="text-ink-muted hover:text-red-500 transition-colors cursor-pointer text-[14px] leading-none"
        >
          ×
        </button>
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
    </div>
  );
}

/**
 * Draggable marketplace question card.
 *
 * @param props.q question data
 * @param props.added whether already in workbook
 * @param props.onClick click handler
 * @return draggable card element
 */
function DraggableMarketCard({ q, added, onClick }: { q: Question; added: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `market-${q.id}`,
    disabled: added,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={`border rounded-lg p-3 transition-colors ${
        added
          ? 'border-grain/50 bg-grain/20 opacity-50'
          : 'border-grain hover:border-ink/30 cursor-grab active:cursor-grabbing'
      }`}
    >
      <Latex text={q.question} className="text-[13px] text-ink leading-relaxed line-clamp-2 block" />
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
      <div className="flex items-center gap-2 mt-2">
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[q.difficulty] ?? ''}`}>
          {q.difficulty}
        </span>
        <span className="text-[10px] font-mono text-ink-muted">{q.type}</span>
        {added && <span className="text-[10px] text-ink-muted ml-auto">추가됨</span>}
      </div>
    </div>
  );
}

/**
 * Workbook editor with marketplace.
 *
 * @return editor page element
 */
export default function WorkbookEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  /** Workbook name */
  const [name, setName] = useState('');
  /** Workbook questions (ordered) */
  const [questions, setQuestions] = useState<Question[]>([]);
  /** Set of question IDs in workbook */
  const [inWorkbook, setInWorkbook] = useState<Set<number>>(new Set());

  /** Topic tree from API */
  const [topics, setTopics] = useState<TopicEntry[]>([]);
  /** Expanded school level */
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  /** Expanded grade */
  const [expandedGrade, setExpandedGrade] = useState<string | null>(null);
  /** Selected topic filter */
  const [selectedTopic, setSelectedTopic] = useState<{ school_level: string; grade: string; topic: string } | null>(null);
  /** Marketplace questions */
  const [marketQuestions, setMarketQuestions] = useState<Question[]>([]);

  /** Currently dragged item ID (number for workbook, "market-N" for marketplace) */
  const [activeId, setActiveId] = useState<string | number | null>(null);

  /** Saving name */
  const [savingName, setSavingName] = useState(false);
  /** Edited name */
  const [editName, setEditName] = useState('');

  /** Fetch workbook data */
  useEffect(() => {
    if (!id) return;
    fetch(`${API}/api/workbooks/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setName(d.workbook.name);
        setEditName(d.workbook.name);
        setQuestions(d.questions ?? []);
        setInWorkbook(new Set((d.questions ?? []).map((q: Question) => q.id)));
      });
  }, [id]);

  /** Fetch topic tree */
  useEffect(() => {
    fetch(`${API}/api/questions/topics`)
      .then((r) => r.json())
      .then((d) => setTopics(d.topics ?? []));
  }, []);

  /** Fetch marketplace questions when topic selected */
  useEffect(() => {
    if (!selectedTopic) {
      setMarketQuestions([]);
      return;
    }
    const params = new URLSearchParams({
      school_level: selectedTopic.school_level,
      grade: selectedTopic.grade,
      curriculum_topic: selectedTopic.topic,
    });
    fetch(`${API}/api/questions?${params}`)
      .then((r) => r.json())
      .then((d) => setMarketQuestions(d.questions ?? []));
  }, [selectedTopic]);

  /** Unique school levels */
  const levels = [...new Set(topics.map((t) => t.school_level))];

  /**
   * Get grades for a school level.
   *
   * @param level school level
   * @return sorted grade list
   */
  const getGrades = (level: string) =>
    [...new Set(topics.filter((t) => t.school_level === level).map((t) => t.grade))];

  /**
   * Get topics for a school level and grade.
   *
   * @param level school level
   * @param grade grade
   * @return topic entries
   */
  const getTopics = (level: string, grade: string) =>
    topics.filter((t) => t.school_level === level && t.grade === grade);

  /**
   * Add question to workbook at optional position.
   *
   * @param q question to add
   * @param index optional insertion index
   * @return void
   */
  const addQuestion = async (q: Question, index?: number) => {
    if (inWorkbook.has(q.id)) return;
    const i = index ?? questions.length;
    const updated = [...questions];
    updated.splice(i, 0, q);
    setQuestions(updated);
    setInWorkbook((prev) => new Set(prev).add(q.id));
    await fetch(`${API}/api/workbooks/${id}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id }),
    });
    await fetch(`${API}/api/workbooks/${id}/questions/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionIds: updated.map((p) => p.id) }),
    });
  };

  /**
   * Remove question from workbook.
   *
   * @param qId question ID to remove
   * @return void
   */
  const removeQuestion = async (qId: number) => {
    setQuestions((prev) => prev.filter((q) => q.id !== qId));
    setInWorkbook((prev) => {
      const next = new Set(prev);
      next.delete(qId);
      return next;
    });
    await fetch(`${API}/api/workbooks/${id}/questions/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: qId }),
    });
  };

  /**
   * Handle drag start.
   *
   * @param event drag start event
   * @return void
   */
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  /** Ref for left marketplace panel */
  const marketplaceRef = useRef<HTMLDivElement>(null);
  /** Droppable zone for workbook panel */
  const { setNodeRef: setWorkbookDropRef } = useDroppable({ id: 'workbook-drop' });

  /**
   * Handle drag end for reordering, removing, or adding.
   *
   * @param event drag end event
   * @return void
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    const dragId = activeId;
    setActiveId(null);
    if (!dragId) return;

    const { active, over } = event;

    /** Compute final pointer position */
    const pointer = event.activatorEvent instanceof PointerEvent && (event as any).delta
      ? {
          x: (event.activatorEvent as PointerEvent).clientX + (event as any).delta.x,
          y: (event.activatorEvent as PointerEvent).clientY + (event as any).delta.y,
        }
      : null;

    /** Marketplace item → workbook */
    if (typeof dragId === 'string' && String(dragId).startsWith('market-')) {
      const marketRect = marketplaceRef.current?.getBoundingClientRect();
      if (!pointer || !marketRect || pointer.x <= marketRect.right) return;

      const qId = Number(String(dragId).replace('market-', ''));
      const q = marketQuestions.find((mq) => mq.id === qId);
      if (!q) return;
      if (over && typeof over.id === 'number') {
        const idx = questions.findIndex((p) => p.id === over.id);
        addQuestion(q, idx >= 0 ? idx : undefined);
      } else {
        addQuestion(q);
      }
      return;
    }

    /** Workbook item dragged to marketplace → remove */
    if (pointer && marketplaceRef.current) {
      const rect = marketplaceRef.current.getBoundingClientRect();
      if (pointer.x < rect.right) {
        removeQuestion(dragId as number);
        return;
      }
    }

    /** Workbook reorder */
    if (!over || active.id === over.id) return;

    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(questions, oldIndex, newIndex);
    setQuestions(reordered);

    await fetch(`${API}/api/workbooks/${id}/questions/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionIds: reordered.map((q) => q.id) }),
    });
  };

  /**
   * Save workbook name.
   *
   * @return void
   */
  const handleSaveName = async () => {
    if (!editName.trim() || savingName || editName.trim() === name) return;
    setSavingName(true);
    try {
      await fetch(`${API}/api/workbooks/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      setName(editName.trim());
    } finally {
      setSavingName(false);
    }
  };

  /** Whether active drag is from marketplace */
  const isMarketDrag = typeof activeId === 'string' && String(activeId).startsWith('market-');
  /** Active dragged question */
  const activeQuestion = activeId
    ? isMarketDrag
      ? marketQuestions.find((q) => q.id === Number(String(activeId).replace('market-', '')))
      : questions.find((q) => q.id === activeId)
    : null;
  /** Active question index (1-based, 0 for marketplace) */
  const activeIndex = activeId && !isMarketDrag ? questions.findIndex((q) => q.id === activeId) + 1 : 0;

  return (
    <div className="min-h-screen font-display bg-paper-grain flex flex-col">
      <Navbar />
      <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex">
        {/* left: marketplace */}
        <div ref={marketplaceRef} className={`w-[480px] shrink-0 flex border-r transition-colors ${activeId && !isMarketDrag ? 'border-r-red-300 bg-red-50/30' : 'border-grain'}`}>
          {/* topic sidebar */}
          <nav className="w-44 shrink-0 border-r border-grain py-4 px-3 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono px-2 mb-3">
              문제 탐색
            </div>
            <div className="space-y-0.5">
              {levels.map((level) => (
                <div key={level}>
                  <button
                    onClick={() => setExpandedLevel(expandedLevel === level ? null : level)}
                    className="w-full text-left px-2 py-1.5 rounded text-[13px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    {level}
                    <IoIosArrowUp className={`text-[12px] text-ink-muted transition-transform ${expandedLevel === level ? '' : 'rotate-180'}`} />
                  </button>
                  {expandedLevel === level && (
                    <div className="ml-2 space-y-0.5">
                      {getGrades(level).map((grade) => (
                        <div key={grade}>
                          <button
                            onClick={() => setExpandedGrade(expandedGrade === grade ? null : grade)}
                            className="w-full text-left px-2 py-1.5 rounded text-[12px] text-ink-muted hover:text-ink hover:bg-grain/50 transition-colors cursor-pointer flex items-center justify-between"
                          >
                            {grade}
                            <IoIosArrowUp className={`text-[12px] text-ink-muted transition-transform ${expandedGrade === grade ? '' : 'rotate-180'}`} />
                          </button>
                          {expandedGrade === grade && (
                            <div className="ml-2 space-y-0.5">
                              {getTopics(level, grade).map((t) => (
                                <button
                                  key={t.curriculum_topic}
                                  onClick={() =>
                                    setSelectedTopic({
                                      school_level: level,
                                      grade,
                                      topic: t.curriculum_topic,
                                    })
                                  }
                                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors cursor-pointer ${
                                    selectedTopic?.topic === t.curriculum_topic &&
                                    selectedTopic?.grade === grade
                                      ? 'bg-ink text-paper'
                                      : 'text-ink-muted hover:text-ink hover:bg-grain/50'
                                  }`}
                                >
                                  {t.curriculum_topic}
                                  <span className="ml-1 opacity-50">{t.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </nav>

          {/* question list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {selectedTopic && (
              <div className="text-[11px] font-mono text-ink-muted mb-2">
                {selectedTopic.school_level} &gt; {selectedTopic.grade} &gt; {selectedTopic.topic}
              </div>
            )}
            {!selectedTopic ? (
              <div className="text-center pt-12">
                <p className="text-[13px] text-ink-muted">왼쪽에서 단원을 선택하세요.</p>
              </div>
            ) : marketQuestions.length === 0 ? (
              <div className="text-center pt-12">
                <p className="text-[13px] text-ink-muted">문제가 없습니다.</p>
              </div>
            ) : (
              marketQuestions.filter((q) => !inWorkbook.has(q.id)).map((q) => (
                <DraggableMarketCard
                  key={q.id}
                  q={q}
                  added={false}
                  onClick={() => addQuestion(q)}
                />
              ))
            )}
          </div>
        </div>

        {/* right: workbook questions (exam paper layout) */}
        <div className="flex-1 flex flex-col max-w-4xl">
          <div className="px-6 py-5 border-b border-grain">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => navigate(-1)}
                className="text-ink-muted hover:text-ink transition-colors cursor-pointer text-[14px]"
              >
                ← 돌아가기
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                }}
                className="font-display text-[24px] text-ink bg-transparent border-none outline-none flex-1"
              />
              {editName.trim() !== name && (
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="text-[12px] text-ink-muted hover:text-ink cursor-pointer"
                >
                  {savingName ? '저장 중...' : '저장'}
                </button>
              )}
            </div>
            <p className="text-[12px] text-ink-muted font-mono mt-1">{questions.length}문제</p>
          </div>

          <div ref={setWorkbookDropRef} className="flex-1 overflow-y-auto p-6">
            {questions.length === 0 ? (
              <div className="border border-dashed border-grain rounded-lg p-8 text-center">
                <p className="text-[14px] text-ink-muted">
                  왼쪽에서 문제를 클릭하거나 드래그하여 추가하세요.
                </p>
              </div>
            ) : (
              <SortableContext items={questions.map((q) => q.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 gap-3">
                  {questions.map((q, i) => (
                    <SortableCard key={q.id} q={q} index={i + 1} onRemove={() => removeQuestion(q.id)} />
                  ))}
                </div>
              </SortableContext>
            )}
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeQuestion && (
          <div className={`border border-grain rounded-lg ${isMarketDrag ? 'p-3' : 'p-4'} bg-paper shadow-lg cursor-grabbing`}>
            {!isMarketDrag && (
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono font-bold text-ink">{activeIndex}.</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[activeQuestion.difficulty] ?? ''}`}>
                    {activeQuestion.difficulty}
                  </span>
                  <span className="text-[10px] font-mono text-ink-muted">{activeQuestion.school_level} &gt; {activeQuestion.grade} &gt; {activeQuestion.curriculum_topic}</span>
                </div>
                <span className="text-ink-muted text-[14px] leading-none">×</span>
              </div>
            )}
            <Latex text={activeQuestion.question} className="text-[13px] text-ink leading-relaxed line-clamp-2 block" />
            {activeQuestion.type === '객관식' && activeQuestion.choices && (() => {
              const parsed = JSON.parse(activeQuestion.choices!) as Record<string, string>;
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
            {isMarketDrag && (
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[activeQuestion.difficulty] ?? ''}`}>
                  {activeQuestion.difficulty}
                </span>
                <span className="text-[10px] font-mono text-ink-muted">{activeQuestion.type}</span>
              </div>
            )}
          </div>
        )}
      </DragOverlay>
      </DndContext>
    </div>
  );
}
