import { useState, useEffect } from 'react';
import AppLayout, { type ClassItem } from '../components/AppLayout';
import { getStoredUser } from '../lib/auth';

/** Assignment record from API */
type Assignment = {
  id: number;
  class_id: number;
  title: string;
  problem: string;
  answer: string;
  due_date: string | null;
  submission_count: number;
  total_students: number;
  created_at: string;
};

/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

/**
 * Teacher dashboard with assignment management.
 *
 * @return dashboard page element
 */
export default function Dashboard() {
  /** Current user */
  const user = getStoredUser();
  /** Currently selected class */
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  /** Assignments for selected class */
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  /** Show create assignment modal */
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  /** New assignment title */
  const [newTitle, setNewTitle] = useState('');
  /** New assignment problem */
  const [newProblem, setNewProblem] = useState('');
  /** New assignment answer */
  const [newAnswer, setNewAnswer] = useState('');

  /** Fetch assignments when class selected */
  useEffect(() => {
    if (!selectedClass) return;
    fetch(`${API}/api/assignments/class/${selectedClass.id}`)
      .then((r) => r.json())
      .then((d) => setAssignments(d.assignments ?? []))
      .catch(() => {});
  }, [selectedClass]);

  /**
   * Create a new assignment.
   *
   * @return void
   */
  const handleCreateAssignment = async () => {
    if (!newTitle.trim() || !newProblem.trim() || !newAnswer.trim() || !selectedClass || !user) return;
    const res = await fetch(`${API}/api/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId: selectedClass.id,
        teacherId: user.id,
        title: newTitle.trim(),
        problem: newProblem.trim(),
        answer: newAnswer.trim(),
      }),
    });
    const data = await res.json();
    setAssignments((prev) => [
      { ...data, class_id: selectedClass.id, title: newTitle.trim(), problem: newProblem.trim(), answer: newAnswer.trim(), due_date: null, submission_count: 0, total_students: selectedClass.member_count ?? 0, created_at: new Date().toISOString() },
      ...prev,
    ]);
    setNewTitle('');
    setNewProblem('');
    setNewAnswer('');
    setShowCreateAssignment(false);
  };

  if (!user) return null;

  return (
    <AppLayout selectedClassId={selectedClass?.id} onSelectClass={setSelectedClass}>
      <div className="px-6 lg:px-10 py-10">
        {/* header */}
        <div className="mb-10 flex items-end justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
              Dashboard
            </span>
            <h1 className="mt-2 font-display text-[32px] leading-[1.1] text-ink">
              {user.name}님의 클래스
            </h1>
          </div>
        </div>

        {/* main content */}
        {!selectedClass ? (
          <div className="border border-grain rounded-lg p-12 text-center">
            <p className="text-[15px] text-ink-muted">
              왼쪽에서 클래스를 선택하세요
            </p>
          </div>
        ) : (
          <>
            {/* class header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-[24px] text-ink">{selectedClass.name}</h2>
                <p className="text-[12px] text-ink-muted font-mono mt-1">
                  초대 코드: <span className="text-ink font-medium">{selectedClass.code}</span>
                </p>
              </div>
              <button
                onClick={() => setShowCreateAssignment(true)}
                className="h-10 px-5 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors cursor-pointer"
              >
                + 과제 출제
              </button>
            </div>

            {/* assignments list */}
            {assignments.length === 0 ? (
              <div className="border border-grain rounded-lg p-8 text-center">
                <p className="text-[14px] text-ink-muted">아직 과제가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="border border-grain rounded-lg p-5 hover:border-ink/30 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-[17px] font-medium text-ink">{a.title}</h3>
                        <p className="mt-1 text-[14px] text-ink-muted">{a.problem}</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <div className="text-[13px] font-mono text-ink">
                          {a.submission_count}/{a.total_students}
                        </div>
                        <div className="text-[10px] text-ink-muted font-mono mt-0.5">
                          제출
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* create assignment modal */}
      {showCreateAssignment && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50">
          <div className="bg-paper rounded-lg p-8 w-full max-w-lg shadow-paper-lg">
            <h2 className="font-display text-[22px] text-ink mb-6">과제 출제</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                  제목
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 일차함수 기울기 구하기"
                  className="w-full border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                  문제
                </label>
                <textarea
                  value={newProblem}
                  onChange={(e) => setNewProblem(e.target.value)}
                  placeholder="문제 내용을 입력하세요"
                  rows={3}
                  className="w-full border border-grain bg-paper-warm rounded-lg px-4 py-3 font-mono text-[15px] text-ink resize-none focus:outline-none focus:border-ink transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                  정답
                </label>
                <input
                  type="text"
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value)}
                  placeholder="정답을 입력하세요"
                  className="w-full border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowCreateAssignment(false)}
                className="h-10 px-5 rounded-full text-[13px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleCreateAssignment}
                className="h-10 px-5 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors cursor-pointer"
              >
                출제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
