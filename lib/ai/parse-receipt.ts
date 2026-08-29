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

/**
 * Parse Argentine number format (dots for thousands, comma for decimals)
 * "22.215,50" -> 22215.50
 */
function parseArgentineAmount(str: string): number | null {
  if (!str || str.length < 2) return null;
  
  // Remove currency symbols and spaces
  let cleaned = str.replace(/[$\s]/g, '');
  
  // Check if it has Argentine format (dots for thousands)
  const hasThousandsDot = /\d{1,3}(\.\d{3})+/.test(cleaned);
  const hasDecimalComma = /,\d{1,2}$/.test(cleaned);
  
  if (hasThousandsDot || hasDecimalComma) {
    // Argentine format: remove dots (thousands), replace comma (decimal) with dot
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Try international format: remove commas (thousands)
    cleaned = cleaned.replace(/,/g, '');
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Fallback regex extraction when AI fails to parse receipt.
 * Searches for common patterns like "TOTAL 22215,50" or "Total: $22.215"
 */
function extractAmountWithRegex(ocrText: string): number | null {
  // Normalize text: uppercase, collapse whitespace
  const text = ocrText.toUpperCase().replace(/\s+/g, ' ');
  
  // Pattern 1: "TOTAL" followed by amount (with optional separators)
  // Matches: TOTAL 22215,50 | TOTAL: $22.215,50 | TOTAL A PAGAR 22215.50
  const totalPatterns = [
    /TOTAL\s*(?:A\s*PAGAR)?[:\s]*\$?\s*([\d.,]+)/,
    /IMPORTE\s*TOTAL[:\s]*\$?\s*([\d.,]+)/,
    /TOTAL\s*FACTURA[:\s]*\$?\s*([\d.,]+)/,
  ];
  
  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const amount = parseArgentineAmount(match[1]);
      if (amount && amount > 100 && amount < 10000000) {
        return amount;
      }
    }
  }
  
  // Pattern 2: Look for the largest reasonable amount near "TOTAL" keyword
  const totalIndex = text.lastIndexOf('TOTAL');
  if (totalIndex !== -1) {
    // Search in a window of 150 chars after TOTAL
    const window = text.slice(totalIndex, totalIndex + 150);
    const amounts = window.match(/[\d.,]+/g) || [];
    
    let maxAmount = 0;
    for (const amtStr of amounts) {
      const amt = parseArgentineAmount(amtStr);
      if (amt && amt > maxAmount && amt > 100 && amt < 10000000) {
        maxAmount = amt;
      }
    }
    if (maxAmount > 0) {
      return maxAmount;
    }
  }
  
  // Pattern 3: Find all large numbers and take the largest (last resort)
  const allAmounts = text.match(/[\d.,]+/g) || [];
  let maxAmount = 0;
  for (const amtStr of allAmounts) {
    if (amtStr.length >= 4) { // At least 4 digits for reasonable total
      const amt = parseArgentineAmount(amtStr);
      if (amt && amt > maxAmount && amt > 1000 && amt < 10000000) {
        maxAmount = amt;
      }
    }
  }
  
  return maxAmount > 0 ? maxAmount : null;
}

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
 * Extracts structured expense data from OCR text using Groq with regex fallback.
 * Returns null if all parsing methods fail.
 */
export async function parseReceiptText(ocrText: string): Promise<ParsedReceipt | null> {
  const client = getGroqClient();
  
  // If no Groq client, try regex fallback only
  if (!client) {
    const regexAmount = extractAmountWithRegex(ocrText);
    if (regexAmount) {
      return {
        amount_ars: regexAmount,
        category_slug: null,
        merchant: null,
        date_text: null,
        confidence: 0.3, // Low confidence for regex-only
      };
    }
    return null;
  }

  let raw: string;
  try {
    raw = await client.complete(RECEIPT_SYSTEM_PROMPT, ocrText.slice(0, 2000));
  } catch (err) {
    console.error("Groq receipt parse error:", err instanceof Error ? err.message : String(err));
    // Try regex fallback on AI error
    const regexAmount = extractAmountWithRegex(ocrText);
    if (regexAmount) {
      return {
        amount_ars: regexAmount,
        category_slug: null,
        merchant: null,
        date_text: null,
        confidence: 0.3,
      };
    }
    return null;
  }

  const cleaned = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Groq receipt JSON parse error. Raw:", raw.slice(0, 300));
    // Try regex fallback on JSON parse error
    const regexAmount = extractAmountWithRegex(ocrText);
    if (regexAmount) {
      return {
        amount_ars: regexAmount,
        category_slug: null,
        merchant: null,
        date_text: null,
        confidence: 0.3,
      };
    }
    return null;
  }

  const result = ReceiptSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Groq receipt Zod error:", result.error.message);
    // Try regex fallback on schema error
    const regexAmount = extractAmountWithRegex(ocrText);
    if (regexAmount) {
      return {
        amount_ars: regexAmount,
        category_slug: null,
        merchant: null,
        date_text: null,
        confidence: 0.3,
      };
    }
    return null;
  }

  // If AI returned null amount, try regex fallback
  if (result.data.amount_ars === null) {
    const regexAmount = extractAmountWithRegex(ocrText);
    if (regexAmount) {
      return {
        ...result.data,
        amount_ars: regexAmount,
        confidence: Math.min(result.data.confidence, 0.4), // Lower confidence
      };
    }
  }

  return result.data;
}
