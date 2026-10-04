interface GroqClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

export interface GroqCompletionMetadata {
  model?: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
}

export class GroqCompletionError extends Error {
  readonly code = "GROQ_EMPTY_COMPLETION" as const;

  constructor(readonly metadata: GroqCompletionMetadata) {
    super(`GROQ_EMPTY_COMPLETION ${JSON.stringify(metadata)}`);
    this.name = "GroqCompletionError";
  }
}

function safeProviderLabel(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[\w./:-]{1,100}$/.test(value)) return undefined;
  return value;
}

function safeTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function getCompletionMetadata(data: unknown): GroqCompletionMetadata {
  if (typeof data !== "object" || data === null) return {};
  const response = data as Record<string, unknown>;
  const choice = Array.isArray(response.choices) ? response.choices[0] : undefined;
  const choiceRecord = typeof choice === "object" && choice !== null
    ? choice as Record<string, unknown>
    : undefined;
  const usage = typeof response.usage === "object" && response.usage !== null
    ? response.usage as Record<string, unknown>
    : undefined;

  return {
    model: safeProviderLabel(response.model),
    finishReason: safeProviderLabel(choiceRecord?.finish_reason),
    promptTokens: safeTokenCount(usage?.prompt_tokens),
    completionTokens: safeTokenCount(usage?.completion_tokens),
  };
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

  const replacementModel = "openai/gpt-oss-120b";
  const model = process.env.GROQ_MODEL ?? replacementModel;

  return {
    async complete(systemPrompt: string, userPrompt: string): Promise<string> {
      const request = (selectedModel: string) => fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
          max_tokens: 300,
        }),
      });

      let res = await request(model);
      // A configured model can be retired or unavailable to this account.
      // Retry once with a currently supported production model; an outage or
      // endpoint error still fails closed at the caller's parser boundary.
      if (res.status === 404 && model !== replacementModel) {
        res = await request(replacementModel);
      }

      if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
      const data: unknown = await res.json();
      const metadata = getCompletionMetadata(data);
      const response = typeof data === "object" && data !== null
        ? data as { choices?: Array<{ message?: { content?: unknown } }> }
        : undefined;
      const content = response?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new GroqCompletionError(metadata);
      }
      return content;
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
