import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const questionSchema = z.object({
  type: z.enum(["객관식", "주관식"]),
  question: z.string(),
  choices: z.array(z.string()).length(5).nullable(),
  answer: z.string(),
  explanation: z.string(),
});

const responseSchema = z.object({
  questions: z.array(questionSchema),
});

/** Hand-written JSON schema for Gemini */
const jsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["객관식", "주관식"], description: "객관식 or 주관식" },
          question: { type: "string", description: "Question text in Korean" },
          choices: {
            type: ["array", "null"],
            items: { type: "string" },
            description: "5 choices for 객관식, null for 주관식",
          },
          answer: { type: "string", description: "Correct answer" },
          explanation: { type: "string", description: "Step-by-step solution in Korean" },
        },
        required: ["type", "question", "choices", "answer", "explanation"],
      },
    },
  },
  required: ["questions"],
};

const prompt = `You are a Korean math question generator.

Generate 1 pair (1 객관식 + 1 주관식 = 2 questions total).

Context:
- School level: 중학교
- Grade: 1학년
- Topics: 소인수분해, 최대공약수와 최소공배수
- Difficulty: 중 (보통)

Requirements:
- 객관식: type="객관식", 5 options labeled ①②③④⑤
- 주관식: type="주관식", choices=null
- All in Korean`;

async function main() {
  console.log("=== Gemini Streaming Test ===\n");

  const stream = await ai.models.generateContentStream({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
      temperature: 0.8,
    },
  });

  let full = "";
  for await (const chunk of stream) {
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    process.stdout.write(text);
    full += text;
  }

  console.log("\n\n=== Zod Parse ===\n");
  const parsed = responseSchema.parse(JSON.parse(full));
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch(console.error);
