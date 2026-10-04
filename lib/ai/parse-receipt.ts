import { getAiRuntimeMode, getGroqClient } from "./groq";
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
function extractAmountWithRegex(ocrText: string): { amount: number; confidence: number } | null {
  // Require an explicit total label. OCR may flatten lines and scramble columns,
  // so searching for the largest number anywhere can mistake item prices or a
  // subtotal for the total.
  const text = ocrText.toUpperCase().replace(/\s+/g, ' ');

  // Match TOTAL as a whole word so SUBTOTAL cannot trigger it. TOIAL is a
  // common OCR substitution in the total label.
  const totalPattern = /(?:^|[^A-Z])(?:IMPORTE\s+)?(?:TOTAL|TOIAL)\b/g;
  const amountPattern = /-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/g;
  let match: RegExpExecArray | null;
  const verifiedTotals = new Map<number, number>();

  while ((match = totalPattern.exec(text)) !== null) {
    const suffix = text.slice(match.index + match[0].length, match.index + match[0].length + 180);
    const tokens = suffix.match(amountPattern) ?? [];
    const cents = tokens
      .map(parseArgentineAmount)
      .filter((amount): amount is number => amount !== null)
      .map((amount) => Math.round(amount * 100));
    const reasonable = (amount: number) => amount > 10000 && amount < 1000000000;
    const uniqueAmounts = new Set(cents.filter(reasonable));

    // A single amount (including repeated copies in payment details) directly
    // supports the explicit total label. A subtotal and its trailing discounts
    // immediately before that label can raise confidence: OCR.Space sometimes
    // emits the entire amount column before its final TOIAL/total label.
    // Multiple amounts are ambiguous unless arithmetic reconciles them.
    if (uniqueAmounts.size === 1) {
      const totalCents = [...uniqueAmounts][0];
      const subtotalLabel = text.lastIndexOf("SUBTOTAL", match.index);
      const precedingAmounts = subtotalLabel < 0 ? [] :
        (text.slice(subtotalLabel + "SUBTOTAL".length, match.index).match(amountPattern) ?? [])
          .map(parseArgentineAmount)
          .filter((amount): amount is number => amount !== null)
          .map((amount) => Math.round(amount * 100));
      let previous = precedingAmounts.length - 1;
      let discounts = 0;
      while (previous >= 0 && precedingAmounts[previous] < 0) {
        discounts += precedingAmounts[previous];
        previous--;
      }
      const reconciled = discounts < 0 && previous >= 0 &&
        reasonable(precedingAmounts[previous]) &&
        precedingAmounts[previous] + discounts === totalCents;
      verifiedTotals.set(totalCents / 100, reconciled ? 0.9 : 0.7);
      continue;
    }

    const reconciled = new Set<number>();
    for (let start = 0; start < cents.length; start++) {
      const subtotal = cents[start];
      if (!reasonable(subtotal)) continue;

      let discounts = 0;
      for (let end = start + 1; end < cents.length; end++) {
        if (cents[end] < 0) {
          discounts += cents[end];
          continue;
        }
        // Discounts must be the only values between the subtotal and total.
        if (discounts < 0 && cents[end] === subtotal + discounts && reasonable(cents[end])) {
          reconciled.add(cents[end] / 100);
        }
        break;
      }
    }
    if (reconciled.size === 1) verifiedTotals.set([...reconciled][0], 0.9);
  }

  if (verifiedTotals.size !== 1) return null;
  const [amount, confidence] = [...verifiedTotals][0];
  return { amount, confidence };
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
  // Stub and invalid modes must not manufacture a transaction candidate from
  // local fallback parsing. Callers already treat null as an untrusted result.
  if (getAiRuntimeMode() !== "live") return null;

  const client = getGroqClient();
  
  // If no Groq client, try regex fallback only
  if (!client) {
    const regexAmount = extractAmountWithRegex(ocrText);
    if (regexAmount) {
      return {
        amount_ars: regexAmount.amount,
        category_slug: null,
        merchant: null,
        date_text: null,
        confidence: regexAmount.confidence,
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
        amount_ars: regexAmount.amount,
        category_slug: null,
        merchant: null,
        date_text: null,
        confidence: regexAmount.confidence,
      };
    }
    return null;
  }

  const cleaned = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Groq receipt JSON parse error", { contentLength: raw.length });
    // Try regex fallback on JSON parse error
    const regexAmount = extractAmountWithRegex(ocrText);
    if (regexAmount) {
      return {
        amount_ars: regexAmount.amount,
        category_slug: null,
        merchant: null,
        date_text: null,
        confidence: regexAmount.confidence,
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
        amount_ars: regexAmount.amount,
        category_slug: null,
        merchant: null,
        date_text: null,
        confidence: regexAmount.confidence,
      };
    }
    return null;
  }

  const verifiedTotal = extractAmountWithRegex(ocrText);
  // A reconciled printed total outranks an AI price guess. If the OCR only
  // exposes a weaker, conflicting total, abstain and request manual input.
  if (result.data.amount_ars !== null && verifiedTotal &&
      Math.abs(result.data.amount_ars - verifiedTotal.amount) > 0.01) {
    if (verifiedTotal.confidence >= 0.8) {
      return { ...result.data, amount_ars: verifiedTotal.amount, confidence: verifiedTotal.confidence };
    }
    return { ...result.data, amount_ars: null, confidence: 0 };
  }

  // If AI returned null amount, try regex fallback
  if (result.data.amount_ars === null) {
    if (verifiedTotal) {
      return {
        ...result.data,
        amount_ars: verifiedTotal.amount,
        confidence: verifiedTotal.confidence,
      };
    }
  }

  return result.data;
}
