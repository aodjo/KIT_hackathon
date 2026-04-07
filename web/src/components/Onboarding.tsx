import { useState } from 'react';
import teacherPng from '../content/assets/teacher.png';
import studentPng from '../content/assets/student.png';
import type { GoogleProfile } from '../lib/auth';
import { registerUser, saveUser } from '../lib/auth';

/** User role */
type Role = 'teacher' | 'student';

/** Onboarding stage */
type Stage = 'select' | 'fading' | 'form';

/**
 * Onboarding flow: role selection + profile form.
 *
 * @param props.profile Google profile of the new user
 * @param props.onComplete callback when onboarding finishes
 * @return onboarding element
 */
export default function Onboarding({
  profile,
  onComplete,
}: {
  profile: GoogleProfile;
  onComplete: () => void;
}) {
  /** Current stage */
  const [stage, setStage] = useState<Stage>('select');

  /** Selected role */
  const [role, setRole] = useState<Role | null>(null);
  
  /** Class name input (teacher only) */
  const [className, setClassName] = useState('');

  /** User name input */
  const [userName, setUserName] = useState(() => {
    return profile.name.replace(/[^가-힣a-zA-Z\s]/g, '').trim().toLowerCase();
  });
  
  /** User ID input */
  const [userId, setUserId] = useState(() => {
    return profile.email.split('@')[0].toLowerCase().replace(/[^a-z0-9.]/g, '');
  });

  /** Submitting state */
  const [submitting, setSubmitting] = useState(false);

  /** Pattern: Korean or lowercase letters only */
  const namePattern = /^[가-힣a-z]*$/;

  /** Pattern: lowercase letters, digits, dots only */
  const idPattern = /^[a-z0-9.]*$/;

  /**
   * Handle role card click and start fade transition.
   *
   * @param selected chosen role
   * @return void
   */
  const handleSelect = (selected: Role) => {
    setRole(selected);
    setStage('fading');
    setTimeout(() => setStage('form'), 350);
  };

  /**
   * Handle back to role selection.
   *
   * @return void
   */
  const handleBack = () => {
    setStage('select');
    setRole(null);
    setClassName('');
  };

  /**
   * Submit form and register user.
   *
   * @return void
   */
  const handleSubmit = async () => {
    if (!userName.trim() || !userId.trim()) return;
    if (role === 'teacher' && !className.trim()) return;
    if (submitting) return;

    setSubmitting(true);
    try {
      const user = await registerUser(profile, {
        role: role!,
        userName: userName.trim(),
        userId: userId.trim(),
        ...(role === 'teacher' ? { className: className.trim() } : {}),
      });
      saveUser(user);
      onComplete();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 lg:px-10 py-16">
      {/* header */}
      <div className="mb-12 text-center">
        <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
          Getting Started
        </span>
        <h1 className="mt-3 font-display text-[36px] leading-[1.1] text-ink sm:text-[44px]">
          {stage === 'select' || stage === 'fading'
            ? '역할을 선택하세요'
            : role === 'teacher'
              ? '선생님 정보'
              : '학생 정보'}
        </h1>
      </div>

      {/* role cards */}
      <div className="grid grid-cols-2 gap-6 items-start">
        {(stage === 'select' || stage === 'fading') && (
          <>
            <button
              onClick={() => handleSelect('teacher')}
              className={`group cursor-pointer p-8 text-center border border-grain rounded-lg hover:border-ink transition-all duration-300 ${
                stage === 'fading' ? 'opacity-0 scale-95' : 'opacity-100'
              }`}
            >
              <img
                src={teacherPng}
                alt="선생님"
                className="w-48 h-48 mx-auto mb-5 rounded-lg"
              />
              <div className="font-display text-[22px] text-ink group-hover:text-clay-deep transition-colors">
                선생님
              </div>
              <p className="mt-2 text-[13px] text-ink-muted">
                클래스를 만들고 과제를 출제합니다
              </p>
            </button>
            <button
              onClick={() => handleSelect('student')}
              className={`group cursor-pointer p-8 text-center border border-grain rounded-lg hover:border-ink transition-all duration-300 ${
                stage === 'fading' ? 'opacity-0 scale-95' : 'opacity-100'
              }`}
            >
              <img
                src={studentPng}
                alt="학생"
                className="w-48 h-48 mx-auto mb-5 rounded-lg"
              />
              <div className="font-display text-[22px] text-ink group-hover:text-clay-deep transition-colors">
                학생
              </div>
              <p className="mt-2 text-[13px] text-ink-muted">
                AI 과거 자아와 함께 학습합니다
              </p>
            </button>
          </>
        )}

        {/* teacher form */}
        {stage === 'form' && role === 'teacher' && (
          <>
            <div className="flex items-start justify-center animate-fade-in -mt-8">
              <img
                src={teacherPng}
                alt="선생님"
                className="w-80 h-80 rounded-lg"
              />
            </div>
            <div className="animate-fade-in">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                    클래스 이름
                  </label>
                  <input
                    type="text"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="예: 수학 A반"
                    className="w-full border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                    사용자 이름
                  </label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => namePattern.test(e.target.value) && setUserName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    className="w-full border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">한글, 영문 소문자만 사용 가능</p>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                    아이디
                  </label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => idPattern.test(e.target.value) && setUserId(e.target.value)}
                    placeholder="아이디를 입력하세요"
                    className="w-full border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">영문 소문자, 숫자, 마침표만 사용 가능</p>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full h-11 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors mt-2 disabled:opacity-50"
                >
                  {submitting ? '처리 중...' : '시작하기'}
                </button>
                <p className="text-center text-[12px] text-ink-muted mt-4">
                  선택하신 역할이 잘못 되셨나요?{' '}
                  <button
                    onClick={handleBack}
                    className="underline hover:text-ink transition-colors cursor-pointer"
                  >
                    다시 선택하기
                  </button>
                </p>
              </div>
            </div>
          </>
        )}

        {/* student form */}
        {stage === 'form' && role === 'student' && (
          <>
            <div className="animate-fade-in">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                    사용자 이름
                  </label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => namePattern.test(e.target.value) && setUserName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    className="w-full border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">한글, 영문 소문자만 사용 가능</p>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-2">
                    아이디
                  </label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => idPattern.test(e.target.value) && setUserId(e.target.value)}
                    placeholder="아이디를 입력하세요"
                    className="w-full border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">영문 소문자, 숫자, 마침표만 사용 가능</p>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full h-11 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors mt-2 disabled:opacity-50"
                >
                  {submitting ? '처리 중...' : '시작하기'}
                </button>
                <p className="text-center text-[12px] text-ink-muted mt-4">
                  선택하신 역할이 잘못 되셨나요?{' '}
                  <button
                    onClick={handleBack}
                    className="underline hover:text-ink transition-colors cursor-pointer"
                  >
                    다시 선택하기
                  </button>
                </p>
              </div>
            </div>
            <div className="flex items-start justify-center animate-fade-in -mt-8">
              <img
                src={studentPng}
                alt="학생"
                className="w-80 h-80 rounded-lg"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
