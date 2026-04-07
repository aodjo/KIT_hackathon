import { useState, useRef, useEffect } from 'react';
import AppLayout from '../components/AppLayout';

/** Chat message author role */
type Role = 'ai' | 'student';

/** Single chat message */
type Message = {
  id: number;
  role: Role;
  content: string;
};

/** Learning flow stage */
type Stage = 'problem' | 'dialogue';

/** Assigned problem from teacher */
const problem = {
  topic: '일차함수 · 기울기',
  curriculumId: 'C12',
  statement: '두 점 (1, 3)과 (4, 12)를 지나는 직선의 기울기를 구하세요.',
  answer: '3',
};

/** Demo past-self response script */
const aiScript = [
  '정답이네. 근데 어떻게 3이 나왔는지 나한테 설명해줄 수 있어?',
  '음... 그럼 그냥 y값을 x값으로 나눈 거야?',
  '변화량? 그게 뭔지 더 풀어서 말해줄래?',
  '아, 두 점 사이가 얼마나 움직였는지 보는 거구나. 근데 왜 값 자체가 아니라 변화량을 봐?',
  '이제 알 것 같아. 기울기는 y가 얼마나 빠르게 바뀌는지를 x의 변화량 기준으로 본 거지?',
];

/**
 * Learn page with teacher-assigned problem and MirrorMind dialogue.
 * @return learn page element
 */
export default function Learn() {
  /** Current learning flow stage */
  const [stage, setStage] = useState<Stage>('problem');
  /** Student answer text */
  const [answer, setAnswer] = useState('');
  /** Submitted answer displayed in dialogue stage */
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  /** Past-self dialogue messages */
  const [messages, setMessages] = useState<Message[]>([]);
  /** Explanation input text */
  const [input, setInput] = useState('');
  /** Understanding gauge 0-100 */
  const [understanding, setUnderstanding] = useState(0);
  /** Next script index */
  const [scriptStep, setScriptStep] = useState(0);
  /** Scroll anchor at bottom of message area */
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  /**
   * Submit answer and transition into dialogue stage.
   * @return void
   */
  const handleSubmitAnswer = () => {
    if (!answer.trim()) return;
    setSubmittedAnswer(answer.trim());
    setStage('dialogue');
    setMessages([{ id: 0, role: 'ai', content: aiScript[0] }]);
    setScriptStep(1);
    setUnderstanding(20);
  };

  /**
   * Send explanation message and advance script.
   * @return void
   */
  const handleSendMessage = () => {
    if (!input.trim()) return;
    /** New student message */
    const studentMsg: Message = {
      id: messages.length,
      role: 'student',
      content: input.trim(),
    };
    setMessages((prev) => [...prev, studentMsg]);
    setInput('');

    if (scriptStep < aiScript.length) {
      setTimeout(() => {
        /** Next AI response from script */
        const aiMsg: Message = {
          id: messages.length + 1,
          role: 'ai',
          content: aiScript[scriptStep],
        };
        setMessages((prev) => [...prev, aiMsg]);
        setUnderstanding((prev) => Math.min(100, prev + 18));
        setScriptStep((s) => s + 1);
      }, 700);
    }
  };

  /** Whether submitted answer is correct */
  const isCorrect = submittedAnswer === problem.answer;

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col">
        <div className="mx-auto w-full max-w-3xl px-6 lg:px-10 py-10 flex-1 flex flex-col">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
                Learning
              </span>
              <div className="mt-2 font-display text-[28px] leading-[1.1] text-ink">
                {problem.topic}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
                Progress
              </span>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-[3px] w-36 rounded-full bg-grain overflow-hidden">
                  <div
                    className="h-full bg-ink transition-all duration-500"
                    style={{ width: `${understanding}%` }}
                  />
                </div>
                <span className="font-mono text-[13px] text-ink tabular-nums">
                  {understanding}%
                </span>
              </div>
            </div>
          </div>

          <div className="border border-grain bg-paper rounded-lg p-6 mb-8">
            <div className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono mb-3">
              Problem
            </div>
            <p className="font-display text-[19px] leading-[1.55] text-ink">
              {problem.statement}
            </p>
            {stage === 'problem' ? (
              <div className="mt-5 flex gap-3">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSubmitAnswer();
                  }}
                  placeholder="답을 입력하세요"
                  className="flex-1 border border-grain bg-paper-warm rounded-lg px-4 py-2.5 font-mono text-[15px] text-ink focus:outline-none focus:border-ink transition-colors"
                />
                <button
                  onClick={handleSubmitAnswer}
                  className="h-11 px-5 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors"
                >
                  제출
                </button>
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-4 pt-4 border-t border-grain">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-ink-muted font-medium font-mono">
                    Your Answer
                  </span>
                  <span className="font-mono text-[15px] text-ink">
                    {submittedAnswer}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-medium ${
                    isCorrect ? 'text-clay-deep' : 'text-ink-muted'
                  }`}
                >
                  {isCorrect ? '정답' : `정답: ${problem.answer}`}
                </span>
              </div>
            )}
          </div>

          {stage === 'dialogue' && (
            <>
              <div className="flex-1 space-y-10 overflow-y-auto">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] font-mono">
                      <span
                        className={
                          msg.role === 'student'
                            ? 'text-ink font-medium'
                            : 'text-clay-deep font-medium'
                        }
                      >
                        {msg.role === 'student' ? 'You' : 'Past Self'}
                      </span>
                    </div>
                    <p className="font-display text-[19px] leading-[1.6] text-ink max-w-2xl">
                      {msg.content}
                    </p>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="mt-6 flex gap-3 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="과거 자아에게 설명해주세요..."
                  rows={2}
                  className="flex-1 border border-grain bg-paper rounded-lg px-4 py-3 font-display text-[16px] leading-[1.5] text-ink resize-none focus:outline-none focus:border-ink transition-colors"
                />
                <button
                  onClick={handleSendMessage}
                  className="h-11 px-5 rounded-full bg-ink text-paper font-medium text-[13px] hover:bg-ink-soft transition-colors shrink-0"
                >
                  전송
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
