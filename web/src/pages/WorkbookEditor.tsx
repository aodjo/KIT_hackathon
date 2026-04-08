import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, closestCenter, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
 * Sortable question card in workbook panel.
 *
 * @param props.q question data
 * @param props.onRemove remove callback
 * @return sortable card element
 */
function SortableCard({ q, onRemove }: { q: Question; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="border border-grain rounded-lg p-4 bg-paper">
      <div className="flex items-start gap-3">
        <div {...attributes} {...listeners} className="cursor-grab mt-1 text-ink-muted hover:text-ink">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="2" r="1.2" /><circle cx="9" cy="2" r="1.2" />
            <circle cx="3" cy="6" r="1.2" /><circle cx="9" cy="6" r="1.2" />
            <circle cx="3" cy="10" r="1.2" /><circle cx="9" cy="10" r="1.2" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] text-ink leading-relaxed line-clamp-2">{q.question}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[q.difficulty] ?? ''}`}>
              {q.difficulty}
            </span>
            <span className="text-[10px] font-mono text-ink-muted">{q.type}</span>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-ink-muted hover:text-red-500 transition-colors cursor-pointer shrink-0 text-[16px] leading-none"
        >
          ×
        </button>
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

  /** Currently dragged item ID */
  const [activeId, setActiveId] = useState<number | null>(null);

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
   * Add question to workbook.
   *
   * @param q question to add
   * @return void
   */
  const addQuestion = async (q: Question) => {
    if (inWorkbook.has(q.id)) return;
    setQuestions((prev) => [...prev, q]);
    setInWorkbook((prev) => new Set(prev).add(q.id));
    await fetch(`${API}/api/workbooks/${id}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id }),
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
    setActiveId(event.active.id as number);
  };

  /**
   * Handle drag end for reordering.
   *
   * @param event drag end event
   * @return void
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
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

  /** Active dragged question */
  const activeQuestion = activeId ? questions.find((q) => q.id === activeId) : null;

  return (
    <div className="min-h-screen font-display bg-paper-grain flex flex-col">
      <Navbar />
      <div className="flex-1 flex">
        {/* left: marketplace */}
        <div className="w-[480px] shrink-0 flex border-r border-grain">
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
                    className="w-full text-left px-2 py-1.5 rounded text-[13px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer"
                  >
                    {level}
                  </button>
                  {expandedLevel === level && (
                    <div className="ml-2 space-y-0.5">
                      {getGrades(level).map((grade) => (
                        <div key={grade}>
                          <button
                            onClick={() => setExpandedGrade(expandedGrade === grade ? null : grade)}
                            className="w-full text-left px-2 py-1.5 rounded text-[12px] text-ink-muted hover:text-ink hover:bg-grain/50 transition-colors cursor-pointer"
                          >
                            {grade}
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
            {!selectedTopic ? (
              <div className="text-center pt-12">
                <p className="text-[13px] text-ink-muted">왼쪽에서 단원을 선택하세요.</p>
              </div>
            ) : marketQuestions.length === 0 ? (
              <div className="text-center pt-12">
                <p className="text-[13px] text-ink-muted">문제가 없습니다.</p>
              </div>
            ) : (
              marketQuestions.map((q) => {
                /** Whether this question is already in workbook */
                const added = inWorkbook.has(q.id);
                return (
                  <div
                    key={q.id}
                    onClick={() => !added && addQuestion(q)}
                    className={`border rounded-lg p-3 transition-colors ${
                      added
                        ? 'border-grain/50 bg-grain/20 opacity-50'
                        : 'border-grain hover:border-ink/30 cursor-pointer'
                    }`}
                  >
                    <p className="text-[13px] text-ink leading-relaxed line-clamp-2">{q.question}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${diffColor[q.difficulty] ?? ''}`}>
                        {q.difficulty}
                      </span>
                      <span className="text-[10px] font-mono text-ink-muted">{q.type}</span>
                      {added && <span className="text-[10px] text-ink-muted ml-auto">추가됨</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* right: workbook questions */}
        <div className="flex-1 flex flex-col">
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

          <div className="flex-1 overflow-y-auto p-6 space-y-2">
            {questions.length === 0 ? (
              <div className="border border-dashed border-grain rounded-lg p-8 text-center">
                <p className="text-[14px] text-ink-muted">
                  왼쪽에서 문제를 클릭하여 추가하세요.
                </p>
              </div>
            ) : (
              <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                  {questions.map((q) => (
                    <SortableCard key={q.id} q={q} onRemove={() => removeQuestion(q.id)} />
                  ))}
                </SortableContext>
                <DragOverlay>
                  {activeQuestion && (
                    <div className="border border-ink/20 rounded-lg p-4 bg-paper shadow-lg">
                      <p className="text-[14px] text-ink line-clamp-2">{activeQuestion.question}</p>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
