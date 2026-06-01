import { getGroqClient } from "./groq";
import { z } from "zod";

const ReceiptSchema = z.object({
  amount_ars: z.number().nullable(),
  category_slug: z.string().nullable(),
  merchant: z.string().nullable(),
  date_text: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type ParsedReceipt = z.infer<typeof ReceiptSchema>;

const RECEIPT_SYSTEM_PROMPT = `Sos un extractor de datos de tickets y facturas en pesos argentinos.
Analizá el texto del ticket y devolvé SOLO JSON válido. Sin markdown. Sin bloques de código.

CAMPOS:
- amount_ars: monto TOTAL en pesos (número sin símbolo $). Buscá "TOTAL", "Total a pagar", "Importe total", "TOTAL $". Si hay varios montos tomá el más grande al final del ticket.
- category_slug: una de estas categorías exactas según el tipo de comercio:
  * supermercado → supermercados, almacenes, hipermercados (Disco, Carrefour, Coto, DIA, Jumbo, etc.)
  * verduleria → verdulerías, fruterías
  * salidas_pareja → bares, cines, entretenimiento, salidas nocturnas
  * restaurante → restaurantes, comida rápida, delivery, cafeterías
  * servicios → servicios, facturas (luz, gas, internet, teléfono)
  * tarjeta → resumen de tarjeta de crédito/débito
  * movilidad → combustible, nafta, peajes, estacionamiento, transporte, Uber, taxi, colectivo, tren, subte
  * viaje → viajes de turismo, hoteles, vuelos, excursiones
  * compras_personales → ropa, calzado, electrónica, farmacia, perfumería
  * imprevistos → cualquier otro gasto no categorizable
  Si no podés determinar, devolvé null.
- merchant: nombre del comercio tal como aparece en el ticket, o null.
- date_text: fecha en formato YYYY-MM-DD si podés parsearla; si no, el texto de la fecha tal cual aparece; si no hay fecha, null.
- confidence: número 0.0 a 1.0 — qué tan seguro estás de la extracción.

REGLAS:
- Devolvé SOLO el JSON. Primera línea { última línea }.
- Si el texto está muy corrupto y no podés extraer monto, devolvé amount_ars: null.`;

/** Strips markdown code fences that Groq sometimes adds */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^`+|`+$/g, "").trim();
}

/**
 * Extracts structured expense data from OCR text using Groq.
 * Returns null if Groq is not configured or parsing fails.
 */
export async function parseReceiptText(ocrText: string): Promise<ParsedReceipt | null> {
  const client = getGroqClient();
  if (!client) return null;

  let raw: string;
  try {
    raw = await client.complete(RECEIPT_SYSTEM_PROMPT, ocrText.slice(0, 2000));
  } catch (err) {
    console.error("Groq receipt parse error:", err instanceof Error ? err.message : String(err));
    return null;
  }

  const cleaned = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Groq receipt JSON parse error. Raw:", raw.slice(0, 300));
    return null;
  }

  const result = ReceiptSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Groq receipt Zod error:", result.error.message);
    return null;
  }

  return result.data;
}
