interface GroqClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

export function getGroqClient(): GroqClient | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";

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
