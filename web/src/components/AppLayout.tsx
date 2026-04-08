import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import { getStoredUser } from '../lib/auth';

/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

/** Workbook item from API */
type WorkbookItem = {
  id: string;
  name: string;
  question_count: number;
};

/** Class item from API */
type ClassItem = {
  id: string;
  name: string;
  code: string;
  member_count?: number;
};

/**
 * Authenticated app layout with sidebar and content area.
 *
 * @param props.children main content
 * @param props.selectedClassId currently selected class ID
 * @param props.onSelectClass callback when a class is selected
 * @return layout element
 */
export default function AppLayout({
  children,
  selectedClassId,
  onSelectClass,
}: {
  children: ReactNode;
  selectedClassId?: string | null;
  onSelectClass?: (cls: ClassItem) => void;
}) {
  /** Current user */
  const user = getStoredUser();
  /** Class list */
  const [classes, setClasses] = useState<ClassItem[]>([]);
  /** Show create class modal */
  const [showCreate, setShowCreate] = useState(false);
  /** New class name input */
  const [newName, setNewName] = useState('');
  /** Class code input for student join */
  const [joinCode, setJoinCode] = useState('');
  /** Creating state */
  const [creating, setCreating] = useState(false);
  /** Teacher workbooks */
  const [workbooks, setWorkbooks] = useState<WorkbookItem[]>([]);
  /** Show create workbook modal */
  const [showCreateWorkbook, setShowCreateWorkbook] = useState(false);
  /** New workbook name */
  const [newWorkbookName, setNewWorkbookName] = useState('');

  const navigate = useNavigate();

  /**
   * Create a new class (teacher) or join by code (student).
   *
   * @return void
   */
  const handleCreateOrJoin = async () => {
    if (!user || creating) return;

    if (user.role === 'teacher') {
      if (!newName.trim()) return;
      setCreating(true);
      try {
        const res = await fetch(`${API}/api/classes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacherId: user.id, name: newName.trim() }),
        });
        const data = await res.json();
        /** Append new class to list */
        const cls: ClassItem = { id: data.id, name: data.name, code: data.code, member_count: 0 };
        setClasses((prev) => [...prev, cls]);
        onSelectClass?.(cls);
        setNewName('');
        setShowCreate(false);
      } finally {
        setCreating(false);
      }
    } else {
      if (!joinCode.trim()) return;
      setCreating(true);
      try {
        const res = await fetch(`${API}/api/classes/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, code: joinCode.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          const joined = data.class as ClassItem;
          setClasses((prev) => [...prev, joined]);
          onSelectClass?.(joined);
          setJoinCode('');
          setShowCreate(false);
        }
      } finally {
        setCreating(false);
      }
    }
  };

  /** Fetch classes on mount */
  useEffect(() => {
    if (!user) return;
    const endpoint =
      user.role === 'teacher'
        ? `${API}/api/classes/teacher/${user.id}`
        : `${API}/api/classes/student/${user.id}`;
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => {
        const list = d.classes ?? [];
        setClasses(list);
        if (list.length > 0 && onSelectClass) onSelectClass(list[0]);
      })
      .catch(() => {});
  }, [user?.id, user?.role]);

  /** Fetch workbooks for teacher */
  useEffect(() => {
    if (!user || user.role !== 'teacher') return;
    fetch(`${API}/api/workbooks/teacher/${user.id}`)
      .then((r) => r.json())
      .then((d) => setWorkbooks(d.workbooks ?? []))
      .catch(() => {});
  }, [user?.id, user?.role]);

  /**
   * Create a new workbook.
   *
   * @return void
   */
  const handleCreateWorkbook = async () => {
    if (!newWorkbookName.trim() || !user) return;
    const res = await fetch(`${API}/api/workbooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: user.id, name: newWorkbookName.trim() }),
    });
    const data = await res.json();
    setWorkbooks((prev) => [{ id: data.id, name: data.name, question_count: 0 }, ...prev]);
    setNewWorkbookName('');
    setShowCreateWorkbook(false);
    navigate(`/workbook/${data.id}`);
  };

  return (
    <div className="min-h-screen font-display bg-paper-grain flex flex-col">
      <Navbar />
      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* sidebar */}
        <aside className="w-72 shrink-0 border-r border-grain px-6 py-6 space-y-2">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono leading-none">
              {user?.role === 'teacher' ? '내 클래스' : '가입한 클래스'}
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="w-5 h-5 flex items-center justify-center rounded text-clay-deep hover:text-ink hover:bg-grain/50 transition-colors cursor-pointer text-[14px] leading-none"
            >
              +
            </button>
          </div>
          {classes.length === 0 && (
            <p className="text-[13px] text-ink-muted">클래스가 없습니다.</p>
          )}
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => onSelectClass?.(cls)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                selectedClassId === cls.id
                  ? 'bg-ink text-paper'
                  : 'hover:bg-grain/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium">{cls.name}</span>
                {cls.member_count != null && (
                  <span
                    className={`text-[11px] font-mono ${
                      selectedClassId === cls.id ? 'text-paper/60' : 'text-ink-muted'
                    }`}
                  >
                    {cls.member_count}명
                  </span>
                )}
              </div>
            </button>
          ))}

          {/* workbooks section (teacher only) */}
          {user?.role === 'teacher' && (
            <>
              <div className="flex items-center justify-between mt-6 mb-4">
                <div className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono leading-none">
                  문제집
                </div>
                <button
                  onClick={() => setShowCreateWorkbook(true)}
                  className="w-5 h-5 flex items-center justify-center rounded text-clay-deep hover:text-ink hover:bg-grain/50 transition-colors cursor-pointer text-[14px] leading-none"
                >
                  +
                </button>
              </div>
              {workbooks.length === 0 && (
                <p className="text-[13px] text-ink-muted">문제집이 없습니다.</p>
              )}
              {workbooks.map((wb) => (
                <button
                  key={wb.id}
                  onClick={() => navigate(`/workbook/${wb.id}`)}
                  className="w-full text-left px-4 py-3 rounded-lg transition-colors cursor-pointer hover:bg-grain/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-medium">{wb.name}</span>
                    <span className="text-[11px] font-mono text-ink-muted">
                      {wb.question_count}문제
                    </span>
                  </div>
                </button>
              ))}
            </>
          )}
        </aside>

        {/* main content */}
        <main className="flex-1">{children}</main>
      </div>

      {/* create / join class modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50" onClick={() => { setShowCreate(false); setNewName(''); setJoinCode(''); }}>
          <div className="bg-paper rounded-lg p-8 w-full max-w-sm shadow-paper-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-[20px] text-ink mb-6">
              {user?.role === 'teacher' ? '클래스 만들기' : '클래스 가입'}
            </h2>
            {user?.role === 'teacher' ? (
              <div>
                <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                  클래스 이름
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateOrJoin();
                  }}
                  placeholder="예: 1학년 3반"
                  className="w-full border border-grain rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                  autoFocus
                />
              </div>
            ) : (
              <div>
                <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                  초대 코드
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => {
                    if (/^[a-z0-9]*$/.test(e.target.value) && e.target.value.length <= 8) {
                      setJoinCode(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateOrJoin();
                  }}
                  placeholder="코드 입력"
                  className="w-full border border-grain rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                  autoFocus
                />
              </div>
            )}
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewName('');
                  setJoinCode('');
                }}
                className="h-10 px-5 rounded-full text-[13px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleCreateOrJoin}
                disabled={creating}
                className="h-10 px-5 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors cursor-pointer disabled:opacity-50"
              >
                {creating
                  ? '처리 중...'
                  : user?.role === 'teacher'
                    ? '만들기'
                    : '가입'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* create workbook modal */}
      {showCreateWorkbook && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50" onClick={() => setShowCreateWorkbook(false)}>
          <div className="bg-paper rounded-lg p-8 w-full max-w-sm shadow-paper-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-[20px] text-ink mb-6">문제집 만들기</h2>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                이름
              </label>
              <input
                type="text"
                value={newWorkbookName}
                onChange={(e) => setNewWorkbookName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateWorkbook();
                }}
                placeholder="예: 중1 일차함수 문제집"
                className="w-full border border-grain rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowCreateWorkbook(false)}
                className="h-10 px-5 rounded-full text-[13px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleCreateWorkbook}
                className="h-10 px-5 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors cursor-pointer"
              >
                만들기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type { ClassItem };
