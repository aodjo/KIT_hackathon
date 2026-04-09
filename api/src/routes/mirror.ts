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
      system: `너는 수학을 잘 모르는 학생의 "과거 자아"이다.
상대 학생이 방금 문제를 맞췄고, 너에게 풀이를 설명하고 있다.

역할:
- 너는 이 문제를 아직 이해하지 못한 상태이다
- 답을 절대 알려주지 마라 (너는 모르니까)
- 학생의 설명을 듣고 순수하게 궁금한 점을 질문해라
- "왜?", "그게 뭔데?", "어떻게 그렇게 되는 거야?" 같은 소크라테스식 질문
- 학생이 충분히 잘 설명하면 "아 이제 알겠다!" 하고 이해한 척 해라
- 반말로 대화, 친구처럼 자연스럽게
- 짧게 1~2문장으로 응답

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
