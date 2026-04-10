import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../db/types';

/** Whisper router - hidden question detection */
const whisper = new Hono<{ Bindings: Env }>();

type InferRequest = {
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
};

type HiddenQuestionAnalysis = {
  stuck_point: string;
  missing_concepts: string[];
  recommended_practice: string;
  confidence: number;
};

/**
 * Normalize arbitrary values into a string array.
 *
 * @param value source value
 * @return cleaned string array
 */
const toStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

/**
 * Normalize model output into the expected analysis shape.
 *
 * @param value parsed model response
 * @return normalized analysis or null
 */
const normalizeAnalysis = (value: unknown): HiddenQuestionAnalysis | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const stuckPoint = typeof candidate.stuck_point === 'string'
    ? candidate.stuck_point.trim()
    : typeof candidate.stuckPoint === 'string'
      ? candidate.stuckPoint.trim()
      : '';
  const recommendedPractice = typeof candidate.recommended_practice === 'string'
    ? candidate.recommended_practice.trim()
    : typeof candidate.recommendedPractice === 'string'
      ? candidate.recommendedPractice.trim()
      : '';
  const confidence = Number(candidate.confidence);
  const missingConcepts = toStringArray(candidate.missing_concepts ?? candidate.missingConcepts);

  if (!stuckPoint) return null;

  return {
    stuck_point: stuckPoint,
    missing_concepts: missingConcepts,
    recommended_practice: recommendedPractice || '유사 문항에서 풀이 근거를 말로 설명하는 연습',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.45,
  };
};

/**
 * Extract JSON even if the model wraps it with extra text.
 *
 * @param text raw model response text
 * @return parsed analysis or null
 */
const extractAnalysisFromText = (text: string) => {
  const direct = normalizeAnalysis(JSON.parse(text));
  if (direct) return direct;
  return null;
};

/**
 * Best-effort JSON extraction for LLM responses.
 *
 * @param text raw response text
 * @return parsed analysis or null
 */
const parseAnalysisText = (text: string) => {
  try {
    return extractAnalysisFromText(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return extractAnalysisFromText(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

/**
 * Infer likely concept tags from the question text.
 *
 * @param text combined problem text
 * @return concept hints
 */
const inferConceptHints = (text: string) => {
  const keywordMap: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /방정식|연립|미지수|근/, label: '방정식 풀이' },
    { pattern: /함수|그래프|좌표/, label: '함수 해석' },
    { pattern: /비례|반비례|비율|퍼센트|확률/, label: '비와 비율' },
    { pattern: /분수|소수|통분|약분/, label: '분수 계산' },
    { pattern: /인수분해|전개|다항식/, label: '식의 변형' },
    { pattern: /삼각형|원|각|도형|넓이|둘레|피타고라스|삼각비/, label: '도형 성질 활용' },
    { pattern: /평균|분산|표준편차|자료/, label: '통계 해석' },
  ];

  const hints = keywordMap
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);

  return hints.length > 0 ? hints : ['문제 해석', '식 세우기'];
};

/**
 * Deterministic fallback analysis when the model is unavailable or malformed.
 *
 * @param body inference request body
 * @param signalDesc human-readable signal summary
 * @return fallback analysis
 */
const buildFallbackAnalysis = (body: InferRequest, signalDesc: string): HiddenQuestionAnalysis => {
  const hesCount = body.signals.hesitations.length;
  const totalHesitationTime = body.signals.hesitations.reduce((sum, h) => sum + h.duration, 0);
  const conceptHints = inferConceptHints(`${body.questionText} ${body.questionAnswer} ${body.workText}`);
  const primaryConcept = conceptHints[0] ?? '핵심 개념 적용';

  let stuckPoint = `${primaryConcept}을(를) 적용하는 기준이 충분히 고정되지 않은 것으로 보입니다.`;
  if (!body.isCorrect) {
    stuckPoint = `${signalDesc || '오답 제출'} 상황에서 ${primaryConcept} 적용과 검산이 흔들린 것으로 보입니다.`;
  } else if (hesCount > 0 || body.signals.deleteCount > 0 || body.signals.answerChanges > 0) {
    stuckPoint = `${signalDesc || '풀이 중 주저'} 패턴이 있었고, ${primaryConcept}의 적용 이유를 완전히 확신하지 못한 채 정답에 도달한 것으로 보입니다.`;
  }

  const recommendedPractice = !body.isCorrect
    ? `${primaryConcept}을 사용해 식을 세우고 중간 계산을 한 줄씩 검산하는 유사문항 2~3개`
    : `${primaryConcept}을 어떤 조건에서 쓰는지 말로 설명한 뒤 비슷한 문제를 다시 풀어보기`;

  const signalWeight = Math.min(
    0.55,
    hesCount * 0.12
      + Math.min(totalHesitationTime / 30000, 0.18)
      + body.signals.deleteCount * 0.08
      + body.signals.answerChanges * 0.09
      + (!body.isCorrect ? 0.18 : 0.05),
  );

  return {
    stuck_point: stuckPoint,
    missing_concepts: conceptHints.slice(0, 3),
    recommended_practice: recommendedPractice,
    confidence: Math.max(0.42, Math.min(0.9, 0.32 + signalWeight)),
  };
};

/**
 * POST /api/whisper/infer
 * Analyze behavior signals and infer the student's hidden question.
 * Body: { studentId, assignmentId, questionId, questionText, studentAnswer, isCorrect, signals }
 *
 * @return inferred question and confidence
 */
whisper.post('/infer', async (c) => {
  const body = await c.req.json<InferRequest>();

  const { signals } = body;
  const hesCount = signals.hesitations.length;
  const totalHesitationTime = signals.hesitations.reduce((sum, h) => sum + h.duration, 0);

  /** Skip if no meaningful signals */
  if (body.isCorrect && hesCount === 0 && signals.deleteCount === 0 && signals.answerChanges === 0) {
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

  const fallbackAnalysis = buildFallbackAnalysis(body, signalDesc);
  let analysis = fallbackAnalysis;
  let source: 'anthropic' | 'heuristic' = 'heuristic';

  try {
    if (c.env.ANTHROPIC_API_KEY) {
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

      const text = response.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n');
      const parsed = parseAnalysisText(text);

      if (parsed) {
        analysis = {
          stuck_point: parsed.stuck_point || fallbackAnalysis.stuck_point,
          missing_concepts: parsed.missing_concepts.length > 0 ? parsed.missing_concepts : fallbackAnalysis.missing_concepts,
          recommended_practice: parsed.recommended_practice || fallbackAnalysis.recommended_practice,
          confidence: Math.max(parsed.confidence, fallbackAnalysis.confidence - 0.08),
        };
        source = 'anthropic';
      }
    }
  } catch (e) {
    console.error('Whisper inference fallback', e);
  }

  /** Store analysis in DB */
  if (analysis.stuck_point && analysis.confidence > 0.25) {
    await c.env.DB.prepare(
      `DELETE FROM behavior_signals
       WHERE student_id = ?
         AND type = 'stuck_analysis'
         AND json_extract(payload, '$.assignment_id') = ?
         AND json_extract(payload, '$.question_id') = ?`,
    )
      .bind(body.studentId, body.assignmentId, body.questionId)
      .run();

    await c.env.DB.prepare(
      `INSERT INTO behavior_signals (student_id, type, payload)
       VALUES (?, 'stuck_analysis', ?)`,
    ).bind(
      body.studentId,
      JSON.stringify({
        assignment_id: body.assignmentId,
        question_id: body.questionId,
        stuck_point: analysis.stuck_point,
        missing_concepts: analysis.missing_concepts,
        recommended_practice: analysis.recommended_practice,
        confidence: analysis.confidence,
        source,
        signals: body.signals,
      }),
    ).run();
  }

  return c.json({ analysis, source });
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
    `SELECT bs.student_id, u.name as student_name, bs.payload, bs.created_at
     FROM behavior_signals bs
     JOIN users u ON bs.student_id = u.id
     WHERE bs.type = 'stuck_analysis'
       AND json_extract(bs.payload, '$.assignment_id') = ?
     ORDER BY bs.created_at DESC`,
  ).bind(assignmentId).all();

  /** Parse payload JSON */
  const analyses = result.results.map((r: any) => {
    const ctx = JSON.parse(r.payload);
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
