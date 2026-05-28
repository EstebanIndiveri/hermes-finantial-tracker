import { getGroqClient } from "./groq";
import { z } from "zod";

const ParsedMessageSchema = z.object({
  intent: z.enum(["register_expense", "query_summary", "query_available", "delete_last", "unknown"]),
  amount_ars: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  date_text: z.string().nullable().optional(),
  needs_confirmation: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
});

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;

const SYSTEM_PROMPT = `Sos un asistente financiero. Analiza el mensaje del usuario y devolvé SOLO JSON válido con:
- intent: "register_expense" | "query_summary" | "query_available" | "delete_last" | "unknown"
- amount_ars: número en pesos o null
- category: slug de categoría o null (opciones: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, viaje, compras_personales, imprevistos)
- merchant: nombre del comercio o null
- description: descripción breve o null
- date_text: referencia a fecha en texto o null
- needs_confirmation: true si necesita confirmación
- confidence: 0.0 a 1.0

Responde SOLO con el JSON, sin markdown ni explicaciones.`;

export async function parseFinancialMessage(text: string): Promise<ParsedMessage> {
  const client = getGroqClient();
  if (!client) {
    return { intent: "unknown", confidence: 0, needs_confirmation: false };
  }

  let raw: string;
  try {
    raw = await client.complete(SYSTEM_PROMPT, text);
  } catch (err) {
    console.error("Groq API error:", err instanceof Error ? err.message : String(err));
    return { intent: "unknown", confidence: 0, needs_confirmation: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (err) {
    console.error("JSON parse error from Groq response:", err instanceof Error ? err.message : String(err));
    return { intent: "unknown", confidence: 0, needs_confirmation: false };
  }

  try {
    return ParsedMessageSchema.parse(parsed);
  } catch (err) {
    console.error("Zod validation error:", err instanceof Error ? err.message : String(err));
    return { intent: "unknown", confidence: 0, needs_confirmation: false };
  }
}
