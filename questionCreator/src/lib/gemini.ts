import { GoogleGenAI } from "@google/genai";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { debugLog, debugLine } from "./debug.js";

/** Resolved directory */
const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, "../../.env") });

/** Gemini API key from environment */
const API_KEY = process.env.GEMINI_API_KEY ?? "";

if (!API_KEY) {
  console.error("GEMINI_API_KEY is not set. Create a .env file with your key.");
  process.exit(1);
}

/** Google Gen AI client instance */
const ai = new GoogleGenAI({ apiKey: API_KEY });

/** Model name */
const MODEL = "gemini-3-flash-preview";

/**
 * Call Gemini API with streaming and log chunks to debug window.
 *
 * @param prompt - Prompt string to send
 * @param jsonSchema - JSON schema for structured output
 * @returns Complete JSON text response
 */
export async function callGemini(prompt: string, jsonSchema: Record<string, unknown>): Promise<string> {
  debugLine("────────────────────────────────────────");
  debugLine(`[Gemini] Requesting...`);

  /** Streaming response */
  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
      temperature: 0.8,
      thinkingConfig: { thinkingBudget: 1024 },
    },
  });

  /** Accumulated full response */
  let full = "";

  for await (const chunk of stream) {
    /** Parts from response chunk */
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if ((part as any).thought) {
        /** Thinking output */
        const thought = part.text ?? "";
        debugLog(`[Think] ${thought}`);
        process.stderr.write(`\x1b[90m${thought}\x1b[0m`);
      } else {
        /** Response text */
        const text = part.text ?? "";
        debugLog(text);
        process.stderr.write(text);
        full += text;
      }
    }
  }

  debugLine("");
  debugLine(`[Gemini] Done (${full.length} chars)`);
  return full;
}
