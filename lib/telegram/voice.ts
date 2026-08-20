import { transcribeAudio } from "@/lib/ai/groq";

export async function downloadTelegramFile(fileId: string): Promise<Buffer | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    const fileInfoRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
    );
    const fileInfo = (await fileInfoRes.json()) as {
      ok: boolean;
      result?: { file_path: string };
      description?: string;
    };

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      console.error("Failed to get Telegram file path:", fileInfo.description ?? "unknown");
      return null;
    }

    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`
    );

    if (!fileRes.ok) {
      console.error("Failed to download Telegram file:", fileRes.status);
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("Error downloading Telegram file:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function transcribeVoiceMessage(fileId: string): Promise<string | null> {
  const audioBuffer = await downloadTelegramFile(fileId);
  if (!audioBuffer) return null;

  const transcription = await transcribeAudio(audioBuffer, "voice.ogg");
  return transcription;
}
