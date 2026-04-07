import { useState, useEffect, type ReactNode } from 'react';
import Navbar from './Navbar';
import { getStoredUser } from '../lib/auth';

/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

/** Class item from API */
type ClassItem = {
  id: number;
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
  selectedClassId?: number | null;
  onSelectClass?: (cls: ClassItem) => void;
}) {
  /** Current user */
  const user = getStoredUser();
  /** Class list */
  const [classes, setClasses] = useState<ClassItem[]>([]);

  /** Fetch classes on mount */
  useEffect(() => {
    if (!user) return;
    const endpoint =
      user.role === 'teacher'
        ? `${API}/api/classes/teacher/${user.id}`
        : `${API}/api/classes/student/${user.id}`;
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => setClasses(d.classes ?? []))
      .catch(() => {});
  }, [user?.id, user?.role]);

  return (
    <div className="min-h-screen font-display bg-paper-grain flex flex-col">
      <Navbar />
      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* sidebar */}
        <aside className="w-64 shrink-0 border-r border-grain px-6 py-8 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-4">
            {user?.role === 'teacher' ? '내 클래스' : '가입한 클래스'}
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
              <div className="text-[15px] font-medium">{cls.name}</div>
              <div
                className={`text-[11px] font-mono mt-1 ${
                  selectedClassId === cls.id ? 'text-paper/60' : 'text-ink-muted'
                }`}
              >
                코드: {cls.code}
                {cls.member_count != null && ` · ${cls.member_count}명`}
              </div>
            </button>
          ))}
        </aside>

        {/* main content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

export type { ClassItem };
