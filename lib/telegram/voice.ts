import { transcribeAudio } from "@/lib/ai/groq";

export async function downloadTelegramFile(fileId: string): Promise<Buffer | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("downloadTelegramFile: TELEGRAM_BOT_TOKEN not set");
    return null;
  }

  try {
    // Step 1: Get file path from Telegram
    console.log("downloadTelegramFile: Getting file path for", fileId);
    const fileInfoRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
    );
    const fileInfo = (await fileInfoRes.json()) as {
      ok: boolean;
      result?: { file_path: string };
      description?: string;
    };

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      console.error("Failed to get Telegram file path:", fileInfo.description ?? "unknown error");
      return null;
    }

    console.log("downloadTelegramFile: Got path:", fileInfo.result.file_path);

    // Step 2: Download the file
    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`
    );

    if (!fileRes.ok) {
      console.error("Failed to download Telegram file:", fileRes.status);
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    console.log("downloadTelegramFile: Downloaded", arrayBuffer.byteLength, "bytes");
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("Error downloading Telegram file:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function transcribeVoiceMessage(fileId: string): Promise<string | null> {
  console.log("transcribeVoiceMessage: Starting for fileId:", fileId);
  const audioBuffer = await downloadTelegramFile(fileId);
  if (!audioBuffer) {
    console.error("transcribeVoiceMessage: Failed to download file");
    return null;
  }

  const transcription = await transcribeAudio(audioBuffer, "voice.ogg");
  console.log("transcribeVoiceMessage: Result:", transcription ? "success" : "failed");
  return transcription;
}
