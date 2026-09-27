interface GroqClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

export type AiRuntimeMode = "live" | "stub" | "invalid";

export type TranscriptionErrorCode =
  | "AI_MODE_STUB"
  | "AI_MODE_INVALID"
  | "GROQ_API_KEY_MISSING"
  | "AUDIO_EMPTY"
  | "GROQ_HTTP_4XX"
  | "GROQ_HTTP_5XX"
  | "GROQ_NETWORK_ERROR"
  | "GROQ_EMPTY_TRANSCRIPTION";

export class TranscriptionError extends Error {
  constructor(readonly code: TranscriptionErrorCode) {
    super(code);
    this.name = "TranscriptionError";
  }
}

/**
 * Missing AI_MODE retains the legacy live behavior. A supplied value must be
 * recognized so an ambiguous staging configuration can never reach Groq.
 */
export function getAiRuntimeMode(): AiRuntimeMode {
  const mode = process.env.AI_MODE;
  if (mode === undefined || mode === "live") return "live";
  if (mode === "stub") return "stub";
  return "invalid";
}

export function getGroqClient(): GroqClient | null {
  if (getAiRuntimeMode() !== "live") return null;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

  return {
    async complete(systemPrompt: string, userPrompt: string): Promise<string> {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
          max_tokens: 300,
        }),
      });

      if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? "";
    },
  };
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = "voice.ogg"
): Promise<string> {
  const runtimeMode = getAiRuntimeMode();
  if (runtimeMode === "stub") throw new TranscriptionError("AI_MODE_STUB");
  if (runtimeMode === "invalid") throw new TranscriptionError("AI_MODE_INVALID");
  if (audioBuffer.length === 0) throw new TranscriptionError("AUDIO_EMPTY");

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new TranscriptionError("GROQ_API_KEY_MISSING");

  const model = process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3-turbo";

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(audioBuffer)]), filename);
  formData.append("model", model);
  formData.append("language", "es");
  formData.append("response_format", "json");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      throw new TranscriptionError(
        res.status >= 500 ? "GROQ_HTTP_5XX" : "GROQ_HTTP_4XX",
      );
    }

    const data = (await res.json()) as { text?: string };
    const text = data.text?.trim();
    if (!text) throw new TranscriptionError("GROQ_EMPTY_TRANSCRIPTION");
    return text;
  } catch (err) {
    if (err instanceof TranscriptionError) throw err;
    throw new TranscriptionError("GROQ_NETWORK_ERROR");
  }
}
