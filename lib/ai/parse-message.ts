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
  requires_reimbursement: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
});

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;

const SYSTEM_PROMPT = `Sos Hermes, un asistente financiero personal en español argentino. Analizá el mensaje del usuario y devolvé SOLO JSON válido.

INTENTS disponibles:
- "register_expense": registrar/agregar/cargar un gasto real ya realizado. Ej: "gasté 47000 en supermercado", "cargá 15000 restaurante", "anota 5000 de verdura", "fui al super y gasté 30000"
- "query_summary": preguntar cuánto gastó, estado del mes, ahorro, resumen. Ej: "cuánto llevo gastado", "cómo voy este mes", "dame el resumen", "cuál es mi ahorro", "qué tal voy"
- "query_available": preguntar el presupuesto disponible, cuánto queda, cuánto hay disponible en una categoría (SIN mencionar un monto propio a gastar). Ej: "cuánto me queda en restaurante", "qué disponible tengo en salidas", "cuánto es el disponible para salidas en pareja", "cuánto hay para pareja", "disponible en supermercado", "presupuesto de tarjeta", "cómo está mi presupuesto de viaje", "cuánto puedo gastar en servicios" (sin monto propio), "cuánto queda para salidas en pareja", "disponible salidas pareja"
- "simulate_expense": preguntar si PUEDE gastar UNA CANTIDAD ESPECÍFICA (tiene monto propio). Ej: "puedo gastar 36000", "me alcanza para 50000 en restaurante", "tengo para gastar 15000", "conviene gastar 40000 ahora"
- "delete_last": borrar, deshacer o eliminar el último gasto. Ej: "borrá el último gasto", "deshacer", "me equivoqué borrá"
- "unknown": no encaja en ninguna categoría financiera

REGLA CRÍTICA para query_available vs simulate_expense:
- Si el mensaje pregunta cuánto HAY disponible (sin mencionar cuánto quiere gastar) → query_available
- Si el mensaje menciona UN MONTO PROPIO que quiere gastar → simulate_expense
- "disponible" o "cuánto queda" o "cuánto hay" → query_available
- "puedo gastar 5000" o "me alcanza para 30000" → simulate_expense

REINTEGRO (reembolso):
- Si el usuario menciona "reintegro", "me lo devuelvan", "necesito que me reintegren", "con reembolso" → requires_reimbursement: true
- Ej: "gasté 5000 en super y necesito reintegro", "2000 verdulería reintegro" → requires_reimbursement: true
- Si no menciona reintegro → requires_reimbursement: false

Categorías válidas (slug): supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos

MAPEO de expresiones a categorías:
- "salidas pareja", "salidas en pareja", "salidas_pareja" → salidas_pareja
- "compras personales", "compras_personales" → compras_personales
- "super", "supermercado" → supermercado
- "verdura", "verdulería" → verduleria
- "tarjeta de crédito", "tarjetas" → tarjeta
- "colectivo", "transporte", "uber", "taxi" → movilidad

Campos a devolver:
- intent: uno de los 6 valores anteriores
- amount_ars: número en pesos argentinos o null (SOLO para register_expense y simulate_expense)
- category: slug exacto de la categoría mencionada o null
- merchant: nombre del comercio o null
- description: descripción breve o null
- date_text: referencia a fecha en texto o null
- needs_confirmation: true si el usuario pide confirmación antes de registrar
- requires_reimbursement: true si el usuario necesita reintegro/reembolso del gasto
- confidence: número entre 0.0 y 1.0 (usar 0.9+ cuando el intent es claro)

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
    return { intent: "unknown", confidence: 0, needs_confirmation: false, requires_reimbursement: false };
  }

  let raw: string;
  try {
    raw = await client.complete(SYSTEM_PROMPT, text);
  } catch (err) {
    console.error("Groq API error:", err instanceof Error ? err.message : String(err));
    return { intent: "unknown", confidence: 0, needs_confirmation: false, requires_reimbursement: false };
  }

  const cleaned = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq JSON parse error. Raw:", raw, "Error:", err instanceof Error ? err.message : String(err));
    return { intent: "unknown", confidence: 0, needs_confirmation: false, requires_reimbursement: false };
  }

  try {
    return ParsedMessageSchema.parse(parsed);
  } catch (err) {
    console.error("Groq Zod validation error:", err instanceof Error ? err.message : String(err), "Parsed:", JSON.stringify(parsed));
    return { intent: "unknown", confidence: 0, needs_confirmation: false, requires_reimbursement: false };
  }
}
