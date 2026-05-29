/**
 * OCR module: downloads photos from Telegram and extracts text via OCR.Space free API.
 */

export interface OcrResult {
  text: string;
  isReliable: boolean;
}

/** Resolves the download URL for a Telegram file by file_id */
async function getTelegramFileUrl(fileId: string): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const res = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  if (!res.ok) throw new Error(`Telegram getFile failed: ${res.status}`);

  const data = await res.json() as { ok: boolean; result?: { file_path?: string } };
  if (!data.ok || !data.result?.file_path) {
    throw new Error("Telegram getFile returned no file_path");
  }

  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}

/** Downloads a Telegram file as a Buffer */
async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const url = await getTelegramFileUrl(fileId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Sends a raw image buffer to OCR.Space and returns extracted text.
 * Uses Spanish language + OCR Engine 2 (best for printed tickets).
 */
export async function runOcrOnBuffer(
  fileBuffer: Buffer,
  mimeType = "image/jpeg"
): Promise<OcrResult | null> {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    console.warn("OCR_SPACE_API_KEY not set — OCR skipped");
    return null;
  }

  const base64 = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  const form = new URLSearchParams();
  form.append("base64Image", base64);
  form.append("language", "spa");
  form.append("isOverlayRequired", "false");
  form.append("detectOrientation", "true");
  form.append("scale", "true");
  form.append("OCREngine", "2");

  let res: Response;
  try {
    res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch (err) {
    console.error("OCR.Space fetch error:", err instanceof Error ? err.message : String(err));
    return null;
  }

  if (!res.ok) {
    console.error("OCR.Space API error:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const data = await res.json() as {
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
    ParsedResults?: Array<{ ParsedText?: string }>;
    OCRExitCode?: number;
  };

  if (data.IsErroredOnProcessing) {
    const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join("; ") : (data.ErrorMessage ?? "unknown");
    console.error("OCR.Space processing error:", msg);
    return null;
  }

  const text = (data.ParsedResults?.[0]?.ParsedText ?? "").trim();
  if (!text) return null;

  return { text, isReliable: data.OCRExitCode === 1 };
}

/**
 * Downloads the largest available Telegram photo and runs OCR on it.
 * @param photoArray - PhotoSize array from Telegram (last = largest)
 */
export async function ocrTelegramPhoto(
  photoArray: Array<{ file_id: string; file_size?: number; width: number; height: number }>
): Promise<OcrResult | null> {
  const largest = photoArray[photoArray.length - 1];
  if (!largest) return null;

  try {
    const buffer = await downloadTelegramFile(largest.file_id);
    return await runOcrOnBuffer(buffer, "image/jpeg");
  } catch (err) {
    console.error("ocrTelegramPhoto error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Downloads a Telegram document and runs OCR (only for image MIME types).
 */
export async function ocrTelegramDocument(
  document: { file_id: string; mime_type?: string }
): Promise<OcrResult | null> {
  const mime = document.mime_type ?? "image/jpeg";
  if (!mime.startsWith("image/")) return null;

  try {
    const buffer = await downloadTelegramFile(document.file_id);
    return await runOcrOnBuffer(buffer, mime);
  } catch (err) {
    console.error("ocrTelegramDocument error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
