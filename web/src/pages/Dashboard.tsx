import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';

/** Class record from API */
type ClassItem = {
  id: number;
  name: string;
  code: string;
  member_count: number;
  created_at: string;
};

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
 * Teacher dashboard with class management and assignment creation.
 * @return dashboard page element
 */
export default function Dashboard() {
  /** Current user from localStorage */
  const [user] = useState(() => {
    const raw = localStorage.getItem('echo-user');
    return raw ? JSON.parse(raw) : null;
  });

  /** Teacher's classes */
  const [classes, setClasses] = useState<ClassItem[]>([]);
  /** Currently selected class */
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  /** Assignments for selected class */
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  /** Show create class modal */
  const [showCreateClass, setShowCreateClass] = useState(false);
  /** Show create assignment modal */
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  /** New class name input */
  const [newClassName, setNewClassName] = useState('');
  /** New assignment title */
  const [newTitle, setNewTitle] = useState('');
  /** New assignment problem */
  const [newProblem, setNewProblem] = useState('');
  /** New assignment answer */
  const [newAnswer, setNewAnswer] = useState('');

  /** Fetch teacher's classes */
  useEffect(() => {
    if (!user) return;
    fetch(`${API}/api/classes/teacher/${user.id}`)
      .then((r) => r.json())
      .then((d) => setClasses(d.classes ?? []))
      .catch(() => {});
  }, [user]);

  /** Fetch assignments when class selected */
  useEffect(() => {
    if (!selectedClass) return;
    fetch(`${API}/api/assignments/class/${selectedClass.id}`)
      .then((r) => r.json())
      .then((d) => setAssignments(d.assignments ?? []))
      .catch(() => {});
  }, [selectedClass]);

  /**
   * Create a new class.
   * @return void
   */
  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    const res = await fetch(`${API}/api/classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: user.id, name: newClassName.trim() }),
    });
    const data = await res.json();
    setClasses((prev) => [{ ...data, member_count: 0 }, ...prev]);
    setNewClassName('');
    setShowCreateClass(false);
  };

  /**
   * Create a new assignment.
   * @return void
   */
  const handleCreateAssignment = async () => {
    if (!newTitle.trim() || !newProblem.trim() || !newAnswer.trim() || !selectedClass) return;
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
      { ...data, class_id: selectedClass.id, title: newTitle.trim(), problem: newProblem.trim(), answer: newAnswer.trim(), due_date: null, submission_count: 0, total_students: selectedClass.member_count, created_at: new Date().toISOString() },
      ...prev,
    ]);
    setNewTitle('');
    setNewProblem('');
    setNewAnswer('');
    setShowCreateAssignment(false);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen font-display bg-paper-grain flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-6 lg:px-10 py-10">
          {/* header */}
          <div className="mb-10 flex items-end justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
                Dashboard
              </span>
              <h1 className="mt-2 font-display text-[32px] leading-[1.1] text-ink">
                {user.userName}님의 클래스
              </h1>
            </div>
            <button
              onClick={() => setShowCreateClass(true)}
              className="h-11 px-6 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors cursor-pointer"
            >
              + 클래스 만들기
            </button>
          </div>

          <div className="flex gap-8">
            {/* ── class list (left sidebar) ── */}
            <div className="w-64 shrink-0 space-y-2">
              {classes.length === 0 && (
                <p className="text-[13px] text-ink-muted">아직 클래스가 없습니다.</p>
              )}
              {classes.map((cls) => (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClass(cls)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                    selectedClass?.id === cls.id
                      ? 'bg-ink text-paper'
                      : 'hover:bg-grain/50'
                  }`}
                >
                  <div className="text-[15px] font-medium">{cls.name}</div>
                  <div className={`text-[11px] font-mono mt-1 ${
                    selectedClass?.id === cls.id ? 'text-paper/60' : 'text-ink-muted'
                  }`}>
                    코드: {cls.code} · {cls.member_count}명
                  </div>
                </button>
              ))}
            </div>

            {/* ── main content (right) ── */}
            <div className="flex-1">
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
          </div>
        </div>
      </main>

      {/* ── create class modal ── */}
      {showCreateClass && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50">
          <div className="bg-paper rounded-lg p-8 w-full max-w-md shadow-paper-lg">
            <h2 className="font-display text-[22px] text-ink mb-6">새 클래스 만들기</h2>
            <div className="mb-4">
              <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                클래스 이름
              </label>
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
                placeholder="예: 중2 수학 A반"
                className="w-full border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCreateClass(false)}
                className="h-10 px-5 rounded-full text-[13px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleCreateClass}
                className="h-10 px-5 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors cursor-pointer"
              >
                만들기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── create assignment modal ── */}
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
    </div>
  );
}
