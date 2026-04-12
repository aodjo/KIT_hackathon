import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../db/types';
import {
  formatCurriculumConceptLabel,
  getCurriculumConcept,
  getCurriculumConceptLineage,
  type CurriculumConcept,
} from '../lib/curriculum';
import { getQuestionResolutionLock } from '../lib/questionLock';

/** Whisper router - hidden question detection */
const whisper = new Hono<{ Bindings: Env }>();

type InferRequest = {
  studentId: number;
  assignmentId: string;
  questionId: number;
  conceptId?: string;
  schoolLevel?: string;
  grade?: string;
  curriculumTopic?: string;
  questionText: string;
  questionAnswer: string;
  questionExplanation?: string;
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
  missing_concept_ids: string[];
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
const normalizeAnalysis = (
  value: unknown,
  candidateConcepts: CurriculumConcept[],
): HiddenQuestionAnalysis | null => {
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
  const conceptCandidates = new Map(candidateConcepts.map((concept) => [concept.id, concept]));
  const rawIds = toStringArray(candidate.missing_concept_ids ?? candidate.missingConceptIds);
  const rawLabels = toStringArray(candidate.missing_concepts ?? candidate.missingConcepts);
  const resolvedIds = Array.from(new Set(
    [...rawIds, ...rawLabels]
      .map((item) => {
        if (conceptCandidates.has(item)) return item;
        for (const concept of conceptCandidates.values()) {
          if (item.includes(concept.id)) return concept.id;
          if (concept.curriculum.some((curriculumItem) => item.includes(curriculumItem))) return concept.id;
        }
        return null;
      })
      .filter((item): item is string => item != null),
  ));

  if (!stuckPoint) return null;

  return {
    stuck_point: stuckPoint,
    missing_concept_ids: resolvedIds,
    missing_concepts: resolvedIds
      .map((id) => conceptCandidates.get(id))
      .filter((concept): concept is CurriculumConcept => concept != null)
      .map((concept) => formatCurriculumConceptLabel(concept)),
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
const extractAnalysisFromText = (text: string, candidateConcepts: CurriculumConcept[]) => {
  const direct = normalizeAnalysis(JSON.parse(text), candidateConcepts);
  if (direct) return direct;
  return null;
};

/**
 * Best-effort JSON extraction for LLM responses.
 *
 * @param text raw response text
 * @return parsed analysis or null
 */
const parseAnalysisText = (text: string, candidateConcepts: CurriculumConcept[]) => {
  try {
    return extractAnalysisFromText(text, candidateConcepts);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return extractAnalysisFromText(text.slice(start, end + 1), candidateConcepts);
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
  const conceptPath = getCurriculumConceptLineage(body.conceptId);
  const currentConcept = getCurriculumConcept(body.conceptId);
  const candidateMap = new Map(conceptPath.map((concept) => [concept.id, concept]));
  const directRequirements = currentConcept?.requirements
    .map((id) => candidateMap.get(id))
    .filter((concept): concept is CurriculumConcept => concept != null) ?? [];

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
  const fallbackConcepts = Array.from(new Set([
    ...(!body.isCorrect ? directRequirements.map((concept) => concept.id) : []),
    ...(currentConcept ? [currentConcept.id] : []),
  ])).slice(0, 3);

  return {
    stuck_point: stuckPoint,
    missing_concept_ids: fallbackConcepts,
    missing_concepts: fallbackConcepts
      .map((id) => candidateMap.get(id))
      .filter((concept): concept is CurriculumConcept => concept != null)
      .map((concept) => formatCurriculumConceptLabel(concept))
      .slice(0, 3),
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

  const existingLock = await getQuestionResolutionLock(
    c.env.DB,
    body.studentId,
    body.assignmentId,
    body.questionId,
  );
  if (existingLock) {
    return c.json({
      analysis: null,
      source: 'locked',
      locked: true,
      teacherHelpRequested: existingLock.teacherHelpRequested,
    }, 409);
  }

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
  const conceptPath = getCurriculumConceptLineage(body.conceptId);
  const currentConcept = getCurriculumConcept(body.conceptId);
  const conceptPathText = conceptPath.length > 0
    ? conceptPath.map((concept) =>
      `- ${concept.id} | ${concept.schoolLevel} ${concept.grade} | ${concept.subject} | 내용: ${concept.curriculum.join(', ')} | 직접 선수: ${concept.requirements.join(', ') || '없음'}`,
    ).join('\n')
    : '- 후보 개념 정보를 찾지 못함';

  const fallbackAnalysis = buildFallbackAnalysis(body, signalDesc);
  let analysis = fallbackAnalysis;
  let source: 'anthropic' | 'heuristic' = 'heuristic';

  try {
    if (c.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: `너는 수학 교육 전문가이다.
학생이 문제를 푸는 과정에서 보인 행동 신호와 풀이를 분석하여:
1. 어디서 막혔는지 (stuck_point)
2. 어떤 개념이 부족한지 (missing_concept_ids)
3. 어떤 유형의 연습이 필요한지 (recommended_practice)
를 분석해라.

규칙:
- 교사가 읽을 수 있도록 간결하게 작성
- missing_concept_ids는 반드시 아래 candidate_concepts에 있는 id만 사용
- missing_concept_ids는 1~3개만 선택
- 현재 문제 단원과 선수 개념 중에서 학생이 실제로 비어 있는 개념을 고르고, 현재 단원만 흔들리면 현재 concept id를 포함
- JSON으로만 응답:
{
  "stuck_point": "학생이 막힌 지점 설명",
  "missing_concept_ids": ["개념ID1", "개념ID2"],
  "recommended_practice": "추천 연습 유형",
  "confidence": 0.0
}`,
        messages: [{
          role: 'user',
          content: `문제: ${body.questionText}
정답: ${body.questionAnswer}
문항 해설: ${body.questionExplanation ?? '(해설 없음)'}
학생 답: ${body.studentAnswer}
정답 여부: ${body.isCorrect ? '정답' : '오답'}
${body.workText ? `풀이 과정: ${body.workText}` : '(풀이 없음)'}
현재 문제 개념: ${currentConcept ? formatCurriculumConceptLabel(currentConcept) : `${body.conceptId ?? '알 수 없음'} · ${body.schoolLevel ?? ''} ${body.grade ?? ''} · ${body.curriculumTopic ?? ''}`.trim()}

candidate_concepts:
${conceptPathText}

행동 신호: ${signalDesc}`,
        }],
      });

      const text = response.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n');
      const parsed = parseAnalysisText(text, conceptPath);

      if (parsed) {
        analysis = {
          stuck_point: parsed.stuck_point || fallbackAnalysis.stuck_point,
          missing_concept_ids: parsed.missing_concept_ids.length > 0 ? parsed.missing_concept_ids : fallbackAnalysis.missing_concept_ids,
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
          concept_id: body.conceptId ?? null,
          current_concept: currentConcept,
          candidate_concepts: conceptPath,
          stuck_point: analysis.stuck_point,
          missing_concept_ids: analysis.missing_concept_ids,
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
      missingConceptIds: ctx.missing_concept_ids ?? [],
      missingConcepts: ctx.missing_concepts,
      recommendedPractice: ctx.recommended_practice,
      confidence: ctx.confidence,
      teacherNoticeRequested: ctx.teacher_notice_requested === true,
      teacherNoticeReason: ctx.teacher_notice_reason ?? null,
      createdAt: r.created_at,
    };
  });

  return c.json({ analyses });
});

export default whisper;
