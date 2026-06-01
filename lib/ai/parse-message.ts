import { getGroqClient } from "./groq";
import { z } from "zod";

const ParsedMessageSchema = z.object({
  intent: z.enum(["register_expense", "query_summary", "query_available", "simulate_expense", "delete_last", "unknown"]),
  amount_ars: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  date_text: z.string().nullable().optional(),
  needs_confirmation: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
});

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;

const SYSTEM_PROMPT = `Sos Hermes, un asistente financiero personal en español argentino. Analizá el mensaje del usuario y devolvé SOLO JSON válido.

INTENTS disponibles:
- "register_expense": registrar/agregar/cargar un gasto real ya realizado. Ej: "gasté 47000 en supermercado", "cargá 15000 restaurante", "anota 5000 de verdura", "fui al super y gasté 30000"
- "query_summary": preguntar cuánto gastó, estado del mes, ahorro, resumen. Ej: "cuánto llevo gastado", "cómo voy este mes", "dame el resumen", "cuál es mi ahorro", "qué tal voy"
- "query_available": preguntar el presupuesto disponible o cuánto queda en una categoría específica (SIN preguntar si puede gastar una cifra). Ej: "dame el presupuesto para supermercado", "cuánto me queda en restaurante", "cómo está mi presupuesto de viaje", "qué disponible tengo en salidas"
- "simulate_expense": preguntar si PUEDE gastar una cantidad, evaluar si alcanza, simular impacto. Ej: "puedo gastar 36000", "me alcanza para 50000 en restaurante", "puedo darme el lujo de gastar 20000", "conviene gastar 40000 ahora", "tengo para gastar 15000"
- "delete_last": borrar, deshacer o eliminar el último gasto. Ej: "borrá el último gasto", "deshacer", "me equivoqué borrá"
- "unknown": no encaja en ninguna categoría financiera

Categorías válidas (slug): supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos

Campos a devolver:
- intent: uno de los 6 valores anteriores
- amount_ars: número en pesos argentinos o null
- category: slug exacto de la categoría mencionada o null
- merchant: nombre del comercio o null
- description: descripción breve o null
- date_text: referencia a fecha en texto o null
- needs_confirmation: true si el usuario pide confirmación antes de registrar
- confidence: número entre 0.0 y 1.0

Respondé ÚNICAMENTE con el objeto JSON. Sin markdown. Sin bloques de código. Primera línea debe ser { y última }.`;

/** Strips markdown code fences that some models add despite instructions */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^`+|`+$/g, "").trim();
}

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

  const cleaned = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq JSON parse error. Raw:", raw, "Error:", err instanceof Error ? err.message : String(err));
    return { intent: "unknown", confidence: 0, needs_confirmation: false };
  }

  try {
    return ParsedMessageSchema.parse(parsed);
  } catch (err) {
    console.error("Groq Zod validation error:", err instanceof Error ? err.message : String(err), "Parsed:", JSON.stringify(parsed));
    return { intent: "unknown", confidence: 0, needs_confirmation: false };
  }
}
