interface GroqClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

export function getGroqClient(): GroqClient | null {
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
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("transcribeAudio: GROQ_API_KEY not configured");
    return null;
  }

  const model = process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3-turbo";
  console.log("transcribeAudio: Using model", model, "buffer size:", audioBuffer.length);

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
      const errorText = await res.text().catch(() => "no body");
      console.error("Groq Whisper API error:", res.status, errorText);
      return null;
    }

    const data = (await res.json()) as { text?: string };
    console.log("transcribeAudio: Success, text:", data.text?.substring(0, 50));
    return data.text ?? null;
  } catch (err) {
    console.error("Groq transcription error:", err instanceof Error ? err.message : err);
    return null;
  }
}
