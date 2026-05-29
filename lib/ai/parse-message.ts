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

const SYSTEM_PROMPT = `Sos Hermes, un asistente financiero personal en español argentino. Analizá el mensaje del usuario y devolvé SOLO JSON válido.

INTENTS disponibles:
- "register_expense": el usuario quiere registrar/agregar/cargar un gasto. Ej: "gasté 47000 en supermercado", "cargá 15000 restaurante", "anota 5000 de verdura"
- "query_summary": el usuario pregunta por su resumen, cuánto gastó, cuánto lleva, estado del mes, ahorro. Ej: "cuánto llevo gastado", "cómo voy este mes", "dame el resumen", "cuál es mi ahorro"
- "query_available": el usuario pregunta por el presupuesto, disponible, cuánto le queda, límite de UNA categoría o de todas. Ej: "dame el presupuesto para supermercado", "cuánto me queda en restaurante", "qué disponible tengo", "cómo está mi presupuesto de viaje", "cuánto puedo gastar en salidas"
- "delete_last": el usuario quiere borrar, deshacer o eliminar el último gasto. Ej: "borrá el último gasto", "deshacer", "me equivoqué borrá"
- "unknown": no es ninguno de los anteriores

Categorías válidas (slug): supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, viaje, compras_personales, imprevistos

Campos a devolver:
- intent: uno de los 5 valores anteriores
- amount_ars: número en pesos argentinos o null
- category: slug exacto de la categoría o null
- merchant: nombre del comercio o local o null
- description: descripción breve o null
- date_text: referencia a fecha en texto o null (ej: "ayer", "el lunes")
- needs_confirmation: true si el usuario pide confirmación antes de registrar
- confidence: número entre 0.0 y 1.0 indicando tu certeza

IMPORTANTE: Respondé SOLO con el JSON, sin markdown, sin explicaciones, sin bloques de código.`;

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
