import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../db/types';

/** Whisper router - hidden question detection */
const whisper = new Hono<{ Bindings: Env }>();

/**
 * POST /api/whisper/infer
 * Analyze behavior signals and infer the student's hidden question.
 * Body: { studentId, assignmentId, questionId, questionText, studentAnswer, isCorrect, signals }
 *
 * @return inferred question and confidence
 */
whisper.post('/infer', async (c) => {
  const body = await c.req.json<{
    studentId: number;
    assignmentId: string;
    questionId: number;
    questionText: string;
    questionAnswer: string;
    studentAnswer: string;
    isCorrect: boolean;
    signals: {
      hesitations: { timestamp: number; duration: number; after: string }[];
      deleteCount: number;
      answerChanges: number;
    };
  }>();

  const { signals } = body;
  const hesCount = signals.hesitations.length;
  const totalHesitationTime = signals.hesitations.reduce((sum, h) => sum + h.duration, 0);

  /** Skip if no meaningful signals */
  if (hesCount === 0 && signals.deleteCount < 2 && signals.answerChanges < 2) {
    return c.json({ question: null, confidence: 0 });
  }

  /** Build signal description for Claude */
  const signalDesc = [
    hesCount > 0 ? `풀이 중 ${hesCount}번 멈춤 (총 ${Math.round(totalHesitationTime / 1000)}초)` : '',
    signals.deleteCount > 0 ? `답을 ${signals.deleteCount}번 지움` : '',
    signals.answerChanges > 0 ? `답을 ${signals.answerChanges}번 변경` : '',
    signals.hesitations.some((h) => h.after === 'drawing') ? '필기 중 멈춤 발생' : '',
    signals.hesitations.some((h) => h.after === 'typing') ? '타이핑 중 멈춤 발생' : '',
  ].filter(Boolean).join(', ');

  try {
    const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `너는 학생의 학습 행동을 분석하는 AI 튜터이다.
학생이 문제를 풀면서 보인 행동 신호(멈춤, 답 수정, 지우기 등)를 분석하여,
학생이 "하고 싶었지만 하지 못한 질문"을 자연어로 추론해라.

규칙:
- 학생의 입장에서 1인칭으로 질문을 작성 (예: "이 부분에서 왜 이렇게 되는 건가요?")
- 문제 내용과 행동 패턴을 모두 고려
- confidence는 0~1 사이 실수
- JSON으로만 응답: { "question": "...", "confidence": 0.0 }`,
      messages: [{
        role: 'user',
        content: `문제: ${body.questionText}
정답: ${body.questionAnswer}
학생 답: ${body.studentAnswer}
정답 여부: ${body.isCorrect ? '정답' : '오답'}

행동 신호: ${signalDesc}

이 학생이 풀면서 하고 싶었던 질문을 추론해주세요.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(text);

    /** Store inferred question in DB */
    if (parsed.question && parsed.confidence > 0.3) {
      await c.env.DB.prepare(
        `INSERT INTO behavior_signals (student_id, signal_type, context, concept_id)
         VALUES (?, 'hidden_question', ?, NULL)`,
      ).bind(
        body.studentId,
        JSON.stringify({
          assignment_id: body.assignmentId,
          question_id: body.questionId,
          inferred_question: parsed.question,
          confidence: parsed.confidence,
          signals: body.signals,
        }),
      ).run();
    }

    return c.json(parsed);
  } catch (e) {
    return c.json({ question: null, confidence: 0, error: String(e) });
  }
});

/**
 * GET /api/whisper/assignment/:assignmentId
 * Get all inferred hidden questions for an assignment (teacher view).
 *
 * @return list of hidden questions per student
 */
whisper.get('/assignment/:assignmentId', async (c) => {
  const assignmentId = c.req.param('assignmentId');

  const result = await c.env.DB.prepare(
    `SELECT bs.student_id, u.name as student_name, bs.context, bs.created_at
     FROM behavior_signals bs
     JOIN users u ON bs.student_id = u.id
     WHERE bs.signal_type = 'hidden_question'
       AND json_extract(bs.context, '$.assignment_id') = ?
     ORDER BY bs.created_at DESC`,
  ).bind(assignmentId).all();

  /** Parse context JSON */
  const questions = result.results.map((r: any) => {
    const ctx = JSON.parse(r.context);
    return {
      studentId: r.student_id,
      studentName: r.student_name,
      questionId: ctx.question_id,
      inferredQuestion: ctx.inferred_question,
      confidence: ctx.confidence,
      signals: ctx.signals,
      createdAt: r.created_at,
    };
  });

  return c.json({ questions });
});

export default whisper;
