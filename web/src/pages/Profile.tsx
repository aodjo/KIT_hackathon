import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { getStoredUser, saveUser, clearUser } from '../lib/auth';

/** API base URL */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

/**
 * Profile page with user info, name edit, logout, and account deletion.
 *
 * @return profile page element
 */
export default function Profile() {
  /** Current user */
  const [user] = useState(() => getStoredUser());
  /** Editable name field */
  const [name, setName] = useState(user?.name ?? '');
  /** Whether name has been changed */
  const [dirty, setDirty] = useState(false);
  /** Saving state */
  const [saving, setSaving] = useState(false);
  /** Delete confirmation visible */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const navigate = useNavigate();

  /** Pattern: Korean or lowercase letters only */
  const namePattern = /^[가-힣a-z]*$/;

  if (!user) {
    navigate('/');
    return null;
  }

  /**
   * Save updated name to API and localStorage.
   *
   * @return void
   */
  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/auth/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, name: name.trim() }),
      });
      if (res.ok) {
        const updated = { ...user, name: name.trim() };
        saveUser(updated);
        setDirty(false);
      }
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle logout.
   *
   * @return void
   */
  const handleLogout = () => {
    clearUser();
    window.location.href = '/';
  };

  /**
   * Handle account deletion.
   *
   * @return void
   */
  const handleDelete = async () => {
    await fetch(`${API}/api/auth/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id }),
    });
    clearUser();
    window.location.href = '/';
  };

  return (
    <AppLayout>
      <div className="px-6 lg:px-10 py-10">
        {/* header */}
        <div className="mb-10">
          <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
            Profile
          </span>
          <h1 className="mt-2 font-display text-[32px] leading-[1.1] text-ink">
            내 정보
          </h1>
        </div>

        <div className="max-w-md mx-auto">

        {/* profile picture */}
        <div className="flex justify-center mb-8">
          {user.picture ? (
            <img
              src={user.picture}
              alt={user.name}
              className="w-20 h-20 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-grain flex items-center justify-center text-[24px] font-medium text-ink">
              {user.name.charAt(0)}
            </div>
          )}
        </div>

        {/* form */}
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
              이름
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                if (namePattern.test(e.target.value)) {
                  setName(e.target.value);
                  setDirty(e.target.value !== user.name);
                }
              }}
              className="w-full border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
            />
            <p className="mt-1 text-[11px] text-ink-muted">한글, 영문 소문자만 사용 가능</p>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
              아이디
            </label>
            <div className="w-full border border-grain rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink-muted cursor-not-allowed">
              {user.user_id}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
              이메일
            </label>
            <div className="w-full border border-grain rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink-muted cursor-not-allowed">
              {user.email}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
              역할
            </label>
            <div className="w-full border border-grain rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink-muted cursor-not-allowed">
              {user.role === 'teacher' ? '선생님' : '학생'}
            </div>
          </div>

          {/* save button */}
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-11 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors mt-2 disabled:opacity-50 cursor-pointer"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          )}
        </div>

        {/* divider */}
        <div className="border-t border-grain mt-10 pt-6 flex gap-3">
          <button
            onClick={handleLogout}
            className="flex-1 h-11 rounded-lg border border-grain text-ink font-medium text-[13px] hover:border-ink transition-colors cursor-pointer"
          >
            로그아웃
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-1 h-11 rounded-lg border border-red-400 text-red-500 font-medium text-[13px] hover:bg-red-50 transition-colors cursor-pointer"
          >
            회원 탈퇴
          </button>
        </div>
        </div>
      </div>

      {/* delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50">
          <div className="bg-paper rounded-lg p-8 w-full max-w-sm shadow-paper-lg">
            <h2 className="font-display text-[20px] text-ink mb-3">정말 탈퇴하시겠습니까?</h2>
            <p className="text-[13px] text-ink-muted mb-6">
              모든 데이터가 삭제되며 복구할 수 없습니다.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="h-10 px-5 rounded-full text-[13px] font-medium text-ink hover:bg-grain/50 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                className="h-10 px-5 rounded-full bg-red-500 text-paper font-medium text-[13px] hover:bg-red-600 transition-colors cursor-pointer"
              >
                탈퇴하기
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
