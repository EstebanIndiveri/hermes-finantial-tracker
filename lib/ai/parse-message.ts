import { getGroqClient } from "./groq";
import { z } from "zod";

const ParsedMessageSchema = z.object({
  intent: z.enum([
    "register_expense",
    "query_summary",
    "query_available",
    "simulate_expense",
    "delete_last",
    "query_reimbursements",
    "add_recurring",
    "list_recurring",
    "toggle_recurring",
    "pending_recurring",
    "confirm_recurring",
    "skip_recurring",
    "unknown"
  ]),
  amount_ars: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  date_text: z.string().nullable().optional(),
  needs_confirmation: z.boolean().default(false),
  requires_reimbursement: z.boolean().default(false),
  recurring_name: z.string().nullable().optional(),
  recurring_day: z.number().nullable().optional(),
  recurring_action: z.enum(["pause", "activate", "confirm", "skip"]).nullable().optional(),
  confidence: z.number().min(0).max(1),
});

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;

const SYSTEM_PROMPT = `Sos Hermes, un asistente financiero personal en español argentino. Analizá el mensaje del usuario y devolvé SOLO JSON válido.

INTENTS disponibles:
- "register_expense": registrar/agregar/cargar un gasto real ya realizado. DETECTAR TODAS estas variantes:
  * Verbos: gasté, gaste, gasto, gastamos, compré, compre, compra, compras, pagué, pague, pago, pagamos
  * Frases: "acabo de gastar", "acabo de comprar", "quiero registrar", "registrar gasto", "nuevo gasto", "hice una compra", "hicimos una compra", "anotar gasto", "cargar gasto", "agregá", "sumá"
  * Sin verbo (categoría + monto): "super 15000", "verdulería 5000", "restaurante 3500"
  * Sin verbo (monto + categoría): "15000 super", "5000 verdulería", "3500 restaurante"
  * Formato libre: "fui al super 30000", "almuerzo 2500", "nafta 8000", "uber 1500"
  * Ejemplos: "gasté 47000 en supermercado", "compré 15000 restaurante", "pagué 5000 de verdura", "acabo de gastar 30000 en super", "super 13000", "13000 verdulería"

- "query_summary": preguntar cuánto gastó, estado del mes, ahorro, resumen. Ej: "cuánto llevo gastado", "cómo voy este mes", "dame el resumen", "cuál es mi ahorro", "qué tal voy"
- "query_available": preguntar el presupuesto disponible, cuánto queda, cuánto hay disponible en una categoría (SIN mencionar un monto propio a gastar). Ej: "cuánto me queda en restaurante", "qué disponible tengo en salidas", "cuánto es el disponible para salidas en pareja", "cuánto hay para pareja", "disponible en supermercado", "presupuesto de tarjeta", "cómo está mi presupuesto de viaje", "cuánto puedo gastar en servicios" (sin monto propio), "cuánto queda para salidas en pareja", "disponible salidas pareja"
- "simulate_expense": preguntar si PUEDE gastar UNA CANTIDAD ESPECÍFICA (tiene monto propio). Ej: "puedo gastar 36000", "me alcanza para 50000 en restaurante", "tengo para gastar 15000", "conviene gastar 40000 ahora"
- "delete_last": borrar, deshacer o eliminar el último gasto. Ej: "borrá el último gasto", "deshacer", "me equivoqué borrá"
- "query_reimbursements": ver reintegros pendientes. Ej: "reintegros", "mis reintegros", "ver reintegros", "qué reintegros tengo", "reembolsos pendientes"
- "add_recurring": agregar un gasto recurrente (fijo mensual). DETECTAR cuando el mensaje contiene "recurrente" + nombre de servicio + monto. Ej: "agregar gasto recurrente 15000 netflix", "crear recurrente alquiler 150000", "nuevo gasto fijo spotify 2500", "agregar pago mensual internet", "agregar recurrente netflix 1500 día 15", "recurrente prime video 1500 el 24", "Agregar recurrente Spotify 2500 el día 10", "nuevo recurrente disney+ 1500 el 10"
- "list_recurring": listar gastos recurrentes configurados. Ej: "mis gastos recurrentes", "recurrentes", "ver gastos fijos", "listar pagos mensuales", "mis recurrentes", "gastos recurrentes", "ver recurrentes"
- "toggle_recurring": pausar o activar un gasto recurrente. Ej: "pausar netflix", "activar alquiler", "desactivar spotify", "reactivar gym"
- "pending_recurring": ver gastos recurrentes pendientes del mes. Ej: "pendientes del mes", "qué tengo que pagar", "gastos pendientes", "recurrentes sin pagar", "pendientes", "qué debo pagar", "pagos pendientes"
- "confirm_recurring": confirmar/pagar un gasto recurrente pendiente. Ej: "confirmar netflix", "pagar alquiler", "marcar pagado spotify"
- "skip_recurring": saltar un gasto recurrente este mes. Ej: "saltar luz este mes", "no pagar netflix este mes", "omitir gym este mes"
- "unknown": no encaja en ninguna categoría financiera

REGLA CRÍTICA para query_available vs simulate_expense:
- Si el mensaje pregunta cuánto HAY disponible (sin mencionar cuánto quiere gastar) → query_available
- Si el mensaje menciona UN MONTO PROPIO que quiere gastar → simulate_expense
- "disponible" o "cuánto queda" o "cuánto hay" → query_available
- "puedo gastar 5000" o "me alcanza para 30000" → simulate_expense

REINTEGRO (reembolso):
- Si el usuario SOLO pregunta por reintegros (sin monto de gasto) → query_reimbursements
- Si el usuario menciona "reintegro" JUNTO CON un gasto → requires_reimbursement: true
- Ej: "gasté 5000 en super y necesito reintegro" → register_expense con requires_reimbursement: true
- Ej: "reintegros" o "ver reintegros" → query_reimbursements

NÚMEROS - IMPORTANTE:
- En Argentina, el punto (.) es separador de MILES, no decimal
- "19.715" significa diecinueve mil setecientos quince (19715)
- "1.500" significa mil quinientos (1500)
- La coma (,) es el separador decimal
- "19,50" significa diecinueve pesos con cincuenta centavos
- SIEMPRE devolver amount_ars como número entero o con decimales usando punto: 19715, no "19.715"

NÚMEROS EN PALABRAS Y ARGOT - PARSEAR CORRECTAMENTE:
- "quince mil" → 15000
- "mil quinientos" → 1500
- "dos mil" → 2000
- "cien" → 100
- "doscientos" → 200
- "quinientos" → 500
- "cien pesos" → 100
- "quinientos y cincuenta" → 550
- "mil" → 1000
- "treinta mil" → 30000
- "15k" o "15K" → 15000 (k = mil)
- "1.5k" → 1500
- "15 lucas" → 15000 (lucas = mil pesos)
- "20 mangos" → 20 (mangos = pesos)
- "5 palos" → 5000000 (palos = millones)

ERRORES DE TRANSCRIPCIÓN DE VOZ - INTERPRETAR CORRECTAMENTE:
- "gato de super" → interpretar como "gasto de super" (register_expense)
- "gacho de supermercado" → interpretar como "gasto de supermercado"
- "gota en restaurante" → interpretar como "gasto en restaurante"
- "gastos de verdulería" → interpretar como "gasto de verdulería"
- "gasto es super" → interpretar como "gasto de super" ("es" suele ser "de" mal transcrito)
- "compre" sin tilde → interpretar como "compré"
- "pague" sin tilde → interpretar como "pagué"
- Si detectás "gato/gacho/gota/compre/pague" + categoría → es register_expense con alta confidence

INFORMACIÓN INCOMPLETA - DEVOLVER register_expense CON LO QUE HAY:
- Si hay categoría pero NO hay monto → amount_ars: null, category: "[slug]", confidence: 0.85
- Si hay monto pero NO hay categoría → amount_ars: [número], category: null, confidence: 0.8
- Ejemplos:
  * "gasté en super" → { intent: "register_expense", amount_ars: null, category: "supermercado", confidence: 0.85 }
  * "compré 15000" → { intent: "register_expense", amount_ars: 15000, category: null, confidence: 0.8 }
  * "super" (solo categoría) → { intent: "register_expense", amount_ars: null, category: "supermercado", confidence: 0.7 }

Categorías válidas (slug): supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos

MAPEO de expresiones a categorías (NORMALIZAR siempre al slug sin tildes):
- "salidas pareja", "salidas en pareja", "salidas_pareja" → "salidas_pareja"
- "compras personales", "compras_personales" → "compras_personales"
- "super", "supermercado", "súper" → "supermercado"
- "verdura", "verdulería", "verduleria" → "verduleria"
- "tarjeta de crédito", "tarjetas" → "tarjeta"
- "colectivo", "transporte", "uber", "taxi" → "movilidad"

REGLAS DE DETECCIÓN DE GASTOS:
- "gasto de [categoria] [monto]" → register_expense
- "gasté [monto] en [categoria]" → register_expense
- "[categoria] [monto]" → register_expense (si hay categoría y monto)
- "[monto] [categoria]" → register_expense (orden flexible)

Campos a devolver:
- intent: uno de los 7 valores anteriores
- amount_ars: número en pesos argentinos o null (SOLO para register_expense y simulate_expense). SIN puntos de miles.
- category: slug exacto SIN TILDES de la categoría mencionada o null. Ej: "verduleria" (no "verdulería")
- merchant: nombre del comercio o null
- description: descripción breve o null
- date_text: referencia a fecha en texto o null
- needs_confirmation: true si el usuario pide confirmación antes de registrar
- requires_reimbursement: true si el usuario necesita reintegro/reembolso del gasto
- recurring_name: nombre del gasto recurrente mencionado (netflix, spotify, alquiler, etc) o null
- recurring_day: día del mes para el gasto recurrente (1-31) o null. Ej: "día 15" → 15, "el 24" → 24, "fin de mes" → 31
- recurring_action: para toggle/confirm/skip → "pause", "activate", "confirm" o "skip", o null
- confidence: número entre 0.0 y 1.0 (usar 0.9+ cuando el intent es claro)

PALABRAS CLAVE - MAPEO DIRECTO (usar siempre):
- Mensaje es SOLO "recurrentes" o "Recurrentes" → intent: list_recurring
- Mensaje es SOLO "pendientes" o "Pendientes" → intent: pending_recurring
- Mensaje es SOLO "reintegros" o "Reintegros" → intent: query_reimbursements
- Mensaje es SOLO "resumen" o "Resumen" → intent: query_summary
- Mensaje contiene "disponible" sin monto → intent: query_available
- Mensaje contiene "recurrente" + nombre de servicio + número (monto) → intent: add_recurring (SIEMPRE)
  - Ej: "agregar recurrente spotify 2500 día 10" → add_recurring, recurring_name: "spotify", amount_ars: 2500, recurring_day: 10
  - Ej: "nuevo recurrente disney+ 1500 el 10" → add_recurring, recurring_name: "disney+", amount_ars: 1500, recurring_day: 10

EJEMPLOS IMPORTANTES:
- "Gasto de verdulería 19.715" → { "intent": "register_expense", "amount_ars": 19715, "category": "verduleria", "confidence": 0.95 }
- "Gasté 19.715 en verdulería" → { "intent": "register_expense", "amount_ars": 19715, "category": "verduleria", "confidence": 0.95 }
- "gasto súper 13000" → { "intent": "register_expense", "amount_ars": 13000, "category": "supermercado", "confidence": 0.95 }
- "verdulería 5000 con reintegro" → { "intent": "register_expense", "amount_ars": 5000, "category": "verduleria", "requires_reimbursement": true, "confidence": 0.95 }
- "gato de super quince mil" → { "intent": "register_expense", "amount_ars": 15000, "category": "supermercado", "confidence": 0.9 }
- "gasté cien pesos en farmacia" → { "intent": "register_expense", "amount_ars": 100, "category": "compras_personales", "confidence": 0.9 }
- "doscientos en el chino" → { "intent": "register_expense", "amount_ars": 200, "category": "supermercado", "confidence": 0.85 }
- "compré 15k en super" → { "intent": "register_expense", "amount_ars": 15000, "category": "supermercado", "confidence": 0.9 }
- "pagué 8000 nafta" → { "intent": "register_expense", "amount_ars": 8000, "category": "movilidad", "confidence": 0.9 }
- "acabo de gastar 3500 en restaurante" → { "intent": "register_expense", "amount_ars": 3500, "category": "restaurante", "confidence": 0.95 }
- "almuerzo 2500" → { "intent": "register_expense", "amount_ars": 2500, "category": "restaurante", "confidence": 0.85 }
- "uber 1500" → { "intent": "register_expense", "amount_ars": 1500, "category": "movilidad", "confidence": 0.85 }
- "15000 super" → { "intent": "register_expense", "amount_ars": 15000, "category": "supermercado", "confidence": 0.85 }
- "quiero registrar 5000 en verdulería" → { "intent": "register_expense", "amount_ars": 5000, "category": "verduleria", "confidence": 0.9 }

GASTO SIN MONTO - INICIAR FLUJO CONVERSACIONAL:
- Si detectás "gasto de [categoría]" SIN monto, devolvé intent: "register_expense" con category pero amount_ars: null
- Ej: "gasto de super" → { "intent": "register_expense", "amount_ars": null, "category": "supermercado", "confidence": 0.9 }
- Ej: "compré en verdulería" → { "intent": "register_expense", "amount_ars": null, "category": "verduleria", "confidence": 0.85 }
- Ej: "fui al restaurante" → { "intent": "register_expense", "amount_ars": null, "category": "restaurante", "confidence": 0.75 }

GASTO SIN CATEGORÍA:
- Ej: "gasté 15000" → { "intent": "register_expense", "amount_ars": 15000, "category": null, "confidence": 0.8 }
- Ej: "compré 5000" → { "intent": "register_expense", "amount_ars": 5000, "category": null, "confidence": 0.8 }
- Ej: "gato de verdulería" → { "intent": "register_expense", "amount_ars": null, "category": "verduleria", "confidence": 0.85 }

Si el mensaje es una sola palabra de las anteriores, usá el intent correspondiente con confidence 0.95.

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
