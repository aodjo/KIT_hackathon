import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout, { type ClassItem } from '../components/AppLayout';
import { getStoredUser } from '../lib/auth';

/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

/** Assignment record for student */
type Assignment = {
  id: number;
  class_id: string;
  class_name: string;
  title: string;
  problem: string;
  answer: string;
  workbook_id: string | null;
  due_date: string | null;
  my_answer: string | null;
  my_correct: number | null;
  submitted_at: string | null;
  submission_status?: 'submitted' | 'progress' | null;
  created_at: string;
};

/**
 * Student dashboard with assignment list.
 *
 * @return dashboard page element
 */
export default function StudentDashboard() {
  const navigate = useNavigate();
  const { classId: classIdFromUrl } = useParams<{ classId: string }>();
  /** Current user */
  const user = getStoredUser();
  /** Selected class */
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  /** All assignments across classes */
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  /** Fetch student assignments */
  useEffect(() => {
    if (!user) return;
    fetch(`${API}/api/assignments/student/${user.id}`)
      .then((r) => r.json())
      .then((d) => setAssignments(d.assignments ?? []))
      .catch(() => {});
  }, [user?.id]);

  /** Filtered assignments for selected class */
  const filtered = selectedClass
    ? assignments.filter((a) => a.class_id === selectedClass.id)
    : assignments;

  if (!user) return null;

  return (
    <AppLayout
      selectedClassId={selectedClass?.id}
      initialClassId={classIdFromUrl}
      onSelectClass={(cls) => { setSelectedClass(cls); if (!classIdFromUrl) navigate(`/c/${cls.id}`, { replace: true }); }}
      onClickClass={(cls) => { setSelectedClass(cls); navigate(`/c/${cls.id}`); }}
    >
      <div className="px-6 lg:px-10 py-10">
        {/* header */}
        <div className="mb-10">
          <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
            과제
          </span>
          <h1 className="mt-2 font-display text-[32px] leading-[1.1] text-ink">
            {selectedClass ? selectedClass.name : '내 과제'}
          </h1>
        </div>

        {/* assignment list */}
        {!selectedClass ? (
          <div className="border border-grain rounded-lg p-12 text-center">
            <p className="text-[15px] text-ink-muted leading-relaxed">
              클래스가 존재하지 않아요.<br />
              사이드바에서 '+' 버튼을 눌러 클래스에 가입해 보세요.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-grain rounded-lg p-8 text-center">
            <p className="text-[14px] text-ink-muted">아직 과제가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => (
              <div
                key={a.id}
                onClick={() => navigate(`/c/${selectedClass.id}/a/${a.id}`)}
                className="border border-grain rounded-lg p-5 hover:border-ink/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[17px] font-medium text-ink">{a.title}</h3>
                      {a.workbook_id && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-grain text-ink-muted">문제집</span>
                      )}
                    </div>
                    <p className="text-[12px] text-ink-muted font-mono mt-1">
                      {new Date(a.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <div className="shrink-0 ml-4">
                    {a.submitted_at ? (
                      <span className={`text-[12px] font-mono px-2.5 py-1 rounded-full ${
                        a.submission_status === 'progress'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : a.my_correct
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : 'bg-red-50 text-red-500 border border-red-200'
                      }`}>
                        {a.my_answer}
                      </span>
                    ) : (
                      <span className="text-[12px] font-mono px-2.5 py-1 rounded-full bg-grain/50 text-ink-muted border border-grain">
                        미제출
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
