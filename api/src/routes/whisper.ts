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
    workText: string;
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
    return c.json({ analysis: null });
  }

  /** Build signal description for Claude */
  const signalDesc = [
    hesCount > 0 ? `풀이 중 ${hesCount}번 멈춤 (총 ${Math.round(totalHesitationTime / 1000)}초)` : '',
    signals.deleteCount > 0 ? `답을 ${signals.deleteCount}번 지움` : '',
    signals.answerChanges > 0 ? `답을 ${signals.answerChanges}번 변경` : '',
    signals.hesitations.some((h) => h.after === 'drawing') ? '필기 도중 멈춤' : '',
    signals.hesitations.some((h) => h.after === 'typing') ? '수식 입력 도중 멈춤' : '',
  ].filter(Boolean).join(', ');

  try {
    const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: `너는 수학 교육 전문가이다.
학생이 문제를 푸는 과정에서 보인 행동 신호와 풀이를 분석하여:
1. 어디서 막혔는지 (stuck_point)
2. 어떤 개념이 부족한지 (missing_concepts)
3. 어떤 유형의 연습이 필요한지 (recommended_practice)
를 분석해라.

규칙:
- 교사가 읽을 수 있도록 간결하게 작성
- missing_concepts는 구체적인 수학 개념명 배열
- JSON으로만 응답:
{
  "stuck_point": "학생이 막힌 지점 설명",
  "missing_concepts": ["개념1", "개념2"],
  "recommended_practice": "추천 연습 유형",
  "confidence": 0.0
}`,
      messages: [{
        role: 'user',
        content: `문제: ${body.questionText}
정답: ${body.questionAnswer}
학생 답: ${body.studentAnswer}
정답 여부: ${body.isCorrect ? '정답' : '오답'}
${body.workText ? `풀이 과정: ${body.workText}` : '(풀이 없음)'}

행동 신호: ${signalDesc}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(text);

    /** Store analysis in DB */
    if (parsed.stuck_point && parsed.confidence > 0.3) {
      await c.env.DB.prepare(
        `INSERT INTO behavior_signals (student_id, signal_type, context, concept_id)
         VALUES (?, 'stuck_analysis', ?, NULL)`,
      ).bind(
        body.studentId,
        JSON.stringify({
          assignment_id: body.assignmentId,
          question_id: body.questionId,
          stuck_point: parsed.stuck_point,
          missing_concepts: parsed.missing_concepts,
          recommended_practice: parsed.recommended_practice,
          confidence: parsed.confidence,
          signals: body.signals,
        }),
      ).run();
    }

    return c.json({ analysis: parsed });
  } catch (e) {
    return c.json({ analysis: null, error: String(e) });
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
     WHERE bs.signal_type = 'stuck_analysis'
       AND json_extract(bs.context, '$.assignment_id') = ?
     ORDER BY bs.created_at DESC`,
  ).bind(assignmentId).all();

  /** Parse context JSON */
  const analyses = result.results.map((r: any) => {
    const ctx = JSON.parse(r.context);
    return {
      studentId: r.student_id,
      studentName: r.student_name,
      questionId: ctx.question_id,
      stuckPoint: ctx.stuck_point,
      missingConcepts: ctx.missing_concepts,
      recommendedPractice: ctx.recommended_practice,
      confidence: ctx.confidence,
      createdAt: r.created_at,
    };
  });

  return c.json({ analyses });
});

export default whisper;
