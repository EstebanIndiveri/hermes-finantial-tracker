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
- amount_ars: monto TOTAL en pesos (número sin símbolo $, sin puntos de miles, solo cifra entera o con coma decimal).
  REGLAS ESTRICTAS para extraer el monto:
  1. Buscá la línea que contenga exactamente "TOTAL" (en mayúsculas) seguida del monto — ese es el valor correcto.
  2. Si hay "TOTAL A PAGAR", "Total a pagar", "Importe Total", "TOTAL FACTURA" — usá ese valor.
  3. IGNORÁ completamente: SKUs/códigos de producto (números de 10+ dígitos como 7793344904), cantidades de ítems, precios parciales, IVA, "IVA Contenido", "Otros Imp.", CUIT, NRO.T, FECHA.
  4. Si ves varios números grandes, tomá el que aparece en la línea con la palabra TOTAL, no el más grande arbitrariamente.
  5. En tickets argentinos el separador de miles es el punto (7.779,00) y el decimal la coma — convertí a número sin puntos de miles: 7779.
  6. Si no encontrás la línea TOTAL, tomá el último subtotal antes de "RECIBIMOS" o "IVA Contenido".
  
- category_slug: una de estas categorías exactas según el tipo de comercio:
  * supermercado → supermercados, almacenes, hipermercados (Disco, Carrefour, Coto, DIA, Jumbo, Ferniplast, etc.)
  * verduleria → verdulerías, fruterías
  * salidas_pareja → bares, cines, entretenimiento, salidas nocturnas
  * restaurante → restaurantes, comida rápida, delivery, cafeterías
  * servicios → servicios, facturas (luz, gas, internet, teléfono)
  * tarjeta → resumen de tarjeta de crédito/débito
  * movilidad → combustible, nafta, peajes, estacionamiento, transporte, Uber, taxi, colectivo, tren, subte
  * viaje → viajes de turismo, hoteles, vuelos, excursiones
  * pareja → gastos compartidos en pareja, regalos de pareja, planes románticos, aniversarios
  * compras_personales → ropa, calzado, electrónica, farmacia, perfumería, ferretería, artículos del hogar
  * imprevistos → cualquier otro gasto no categorizable
  Si no podés determinar con certeza, devolvé null.
  
- merchant: nombre del comercio tal como aparece en el ticket (NO el medio de pago como "Mercado Pago"), o null.
- date_text: fecha en formato YYYY-MM-DD si podés parsearla; si no, el texto de la fecha tal cual; si no hay, null.
- confidence: número 0.0 a 1.0 — qué tan seguro estás de la extracción (sé conservador si el texto está corrupto).

REGLAS GENERALES:
- Devolvé SOLO el JSON. Primera línea { última línea }.
- Si el texto está muy corrupto y no podés extraer monto con confianza, devolvé amount_ars: null.
- El merchant es el NOMBRE DEL LOCAL (ej: "Ferniplast", "Carrefour"), NO el medio de pago (ej: NO "Mercado Pago", NO "Visa").`;

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
