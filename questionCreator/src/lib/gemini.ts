import { GoogleGenAI } from "@google/genai";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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
const MODEL = "gemini-3.0-flash";

/**
 * Call Gemini API with a prompt and get a text response.
 *
 * @param prompt - Prompt string to send
 * @returns Generated text response
 */
export async function callGemini(prompt: string): Promise<string> {
  /** API response */
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      temperature: 0.8,
    },
  });

  return response.text ?? "";
}
