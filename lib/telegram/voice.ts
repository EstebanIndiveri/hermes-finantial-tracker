import { TranscriptionError, transcribeAudio, type TranscriptionErrorCode } from "@/lib/ai/groq";

export type VoiceProcessingErrorCode =
  | TranscriptionErrorCode
  | "TELEGRAM_BOT_TOKEN_MISSING"
  | "TELEGRAM_FILE_LOOKUP_FAILED"
  | "TELEGRAM_FILE_DOWNLOAD_FAILED"
  | "TELEGRAM_FILE_EMPTY";

export class VoiceProcessingError extends Error {
  constructor(readonly code: VoiceProcessingErrorCode) {
    super(code);
    this.name = "VoiceProcessingError";
  }
}

export async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new VoiceProcessingError("TELEGRAM_BOT_TOKEN_MISSING");

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
      throw new VoiceProcessingError("TELEGRAM_FILE_LOOKUP_FAILED");
    }

    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`
    );

    if (!fileRes.ok) {
      throw new VoiceProcessingError("TELEGRAM_FILE_DOWNLOAD_FAILED");
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    if (audioBuffer.length === 0) throw new VoiceProcessingError("TELEGRAM_FILE_EMPTY");
    return audioBuffer;
  } catch (err) {
    if (err instanceof VoiceProcessingError) throw err;
    throw new VoiceProcessingError("TELEGRAM_FILE_DOWNLOAD_FAILED");
  }
}

export async function transcribeVoiceMessage(fileId: string): Promise<string> {
  const audioBuffer = await downloadTelegramFile(fileId);
  try {
    return await transcribeAudio(audioBuffer, "voice.ogg");
  } catch (err) {
    if (err instanceof TranscriptionError) {
      throw new VoiceProcessingError(err.code);
    }
    throw err;
  }
}
