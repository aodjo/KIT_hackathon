import { useState, useEffect } from 'react';
import { IoSettingsOutline } from 'react-icons/io5';
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
  /** Show manage class modal */
  const [showManage, setShowManage] = useState(false);
  /** Active manage tab */
  const [manageTab, setManageTab] = useState<'info' | 'members'>('info');
  /** Editable class name in manage modal */
  const [editName, setEditName] = useState('');
  /** Class members */
  const [members, setMembers] = useState<{ id: number; name: string; user_id: string; picture: string }[]>([]);
  /** Show delete confirmation */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  /** Saving class name */
  const [savingName, setSavingName] = useState(false);

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

  /**
   * Open manage modal and fetch members.
   *
   * @return void
   */
  const openManage = async () => {
    if (!selectedClass) return;
    setEditName(selectedClass.name);
    setManageTab('info');
    setShowDeleteConfirm(false);
    setShowManage(true);
    try {
      const res = await fetch(`${API}/api/classes/${selectedClass.id}`);
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      setMembers([]);
    }
  };

  /**
   * Save updated class name.
   *
   * @return void
   */
  const handleSaveName = async () => {
    if (!selectedClass || !editName.trim() || savingName) return;
    setSavingName(true);
    try {
      await fetch(`${API}/api/classes/${selectedClass.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      setSelectedClass({ ...selectedClass, name: editName.trim() });
    } finally {
      setSavingName(false);
    }
  };

  /**
   * Delete class and reset state.
   *
   * @return void
   */
  const handleDeleteClass = async () => {
    if (!selectedClass) return;
    await fetch(`${API}/api/classes/${selectedClass.id}/delete`, {
      method: 'POST',
    });
    setSelectedClass(null);
    setShowManage(false);
    setShowDeleteConfirm(false);
    window.location.reload();
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
              {selectedClass ? selectedClass.name : `${user.name}님의 클래스`}
            </h1>
            {selectedClass && (
              <p className="text-[12px] text-ink-muted font-mono mt-2">
                초대 코드: <span className="text-ink font-medium">{selectedClass.code}</span>
              </p>
            )}
          </div>
          {selectedClass && (
            <div className="flex gap-2">
              <button
                onClick={openManage}
                className="h-10 px-4 rounded-full border border-grain text-ink-muted font-medium text-[13px] hover:border-ink hover:text-ink transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <IoSettingsOutline className="text-[15px]" />
                관리
              </button>
              <button
                onClick={() => setShowCreateAssignment(true)}
                className="h-10 px-5 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors cursor-pointer"
              >
                <span className="text-[16px] leading-none relative top-[1px]">+</span>&ensp;과제 출제
              </button>
            </div>
          )}
        </div>

        {/* main content */}
        {!selectedClass ? (
          <div className="border border-grain rounded-lg p-12 text-center">
            <p className="text-[15px] text-ink-muted leading-relaxed">
              클래스가 존재하지 않아요.<br />
              사이드바에서 '+' 버튼을 눌러 클래스를 생성해 보세요.
            </p>
          </div>
        ) : (
          <>

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
      {/* manage class modal */}
      {showManage && selectedClass && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50">
          <div className="bg-paper rounded-lg w-full max-w-xl shadow-paper-lg flex overflow-hidden" style={{ height: '420px' }}>
            {/* sidebar */}
            <nav className="w-40 shrink-0 border-r border-grain py-6 px-3 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono px-3 mb-2">
                  관리
                </div>
                <button
                  onClick={() => setManageTab('info')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                    manageTab === 'info' ? 'bg-ink text-paper' : 'text-ink hover:bg-grain/50'
                  }`}
                >
                  정보
                </button>
                <button
                  onClick={() => setManageTab('members')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                    manageTab === 'members' ? 'bg-ink text-paper' : 'text-ink hover:bg-grain/50'
                  }`}
                >
                  멤버
                </button>
              </div>
              <button
                onClick={() => {
                  setShowManage(false);
                  setShowDeleteConfirm(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-ink-muted hover:bg-grain/50 transition-colors cursor-pointer"
              >
                닫기
              </button>
            </nav>

            {/* content */}
            <div className="flex-1 p-8 overflow-y-auto">
              {manageTab === 'info' ? (
                <div className="space-y-6">
                  <h2 className="font-display text-[20px] text-ink">클래스 정보</h2>

                  {/* class name edit */}
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                      클래스 이름
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName();
                        }}
                        className="flex-1 border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                      />
                      <button
                        onClick={handleSaveName}
                        disabled={savingName || editName.trim() === selectedClass.name}
                        className="h-11 px-4 rounded-lg bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-30"
                      >
                        {savingName ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>

                  {/* invite code */}
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                      초대 코드
                    </label>
                    <div className="w-full border border-grain rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink-muted cursor-not-allowed">
                      {selectedClass.code}
                    </div>
                  </div>

                  {/* delete class */}
                  <div className="border-t border-grain pt-5">
                    {!showDeleteConfirm ? (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-[13px] text-red-500 hover:text-red-600 font-medium cursor-pointer transition-colors"
                      >
                        클래스 삭제
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-[13px] text-red-500">정말 삭제하시겠습니까? 모든 데이터가 삭제됩니다.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className="h-9 px-4 rounded-full text-[13px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer"
                          >
                            취소
                          </button>
                          <button
                            onClick={handleDeleteClass}
                            className="h-9 px-4 rounded-full bg-red-500 text-paper font-medium text-[13px] hover:bg-red-600 transition-colors cursor-pointer"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className="font-display text-[20px] text-ink">
                    멤버 <span className="text-ink-muted font-mono text-[14px]">{members.length}</span>
                  </h2>

                  {members.length === 0 ? (
                    <p className="text-[13px] text-ink-muted">아직 멤버가 없습니다.</p>
                  ) : (
                    <div className="divide-y divide-grain">
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center gap-3 py-3">
                          {m.picture ? (
                            <img src={m.picture} alt={m.name} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-grain flex items-center justify-center text-[13px] font-medium text-ink">
                              {m.name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="text-[14px] text-ink font-medium">{m.name}</span>
                            <span className="text-[12px] text-ink-muted font-mono ml-2">{m.user_id}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
