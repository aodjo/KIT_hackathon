import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import type { Env } from '../db/types';

/** MirrorMind router - past-self dialogue */
const mirror = new Hono<{ Bindings: Env }>();

/**
 * POST /api/mirror/chat
 * Generate MirrorMind (past-self) response.
 * Body: { questionText, messages: { role, content }[] }
 *
 * @return AI reply as past-self
 */
mirror.post('/chat', async (c) => {
  const { questionText, messages } = await c.req.json<{
    questionText: string;
    messages: { role: string; content: string }[];
  }>();

  try {
    const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: `너는 이 수학 문제를 못 푸는 학생의 "과거 자아"이다.
상대방(미래의 나)이 이 문제를 맞췄고, 너에게 설명해주고 있다.

너의 상태:
- 이 문제의 개념을 아직 이해 못 함
- 문제를 읽으면 "이거 어떻게 푸는 거지?" 하는 수준
- 핵심 개념(공식, 성질, 정리 등)에 대해 구체적으로 질문해야 함

행동 규칙:
- 문제에 나온 수학 개념에 대해 구체적으로 질문해라
  예) "평행사변형이면 대변이 같다는 건 알겠는데, 대각선은 왜 서로를 이등분해?"
  예) "등변사다리꼴에서 밑각이 같다는 게 무슨 뜻이야? 왜 같은 거야?"
- 절대 정답이나 풀이를 알려주지 마라 (너는 모르니까)
- 상대방이 설명하면 그 설명의 논리적 빈틈을 찾아서 질문해라
- 상대방이 충분히 깊게 설명하면 "아 그래서 그렇구나!" 하고 이해해라
- 반말, 짧게 1~2문장

문제: ${questionText}`,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return c.json({ reply: text });
  } catch (e) {
    return c.json({ reply: null, error: String(e) });
  }
});

export default mirror;
