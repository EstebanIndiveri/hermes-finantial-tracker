# Receipt Amount Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve receipt OCR amount detection with regex fallback and better UX when AI fails

**Architecture:** Add regex-based amount extraction as fallback before showing error. When all detection fails, offer inline buttons to input amount manually instead of requiring /gasto command.

**Tech Stack:** TypeScript, Telegram Bot API, Regex

---

### Task 1: Add Regex Amount Extraction Fallback

**Files:**
- Modify: `lib/ai/parse-receipt.ts` (add helper function)

- [ ] **Step 1: Add regex fallback function**

Add this function before `parseReceiptText`:

```typescript
/**
 * Fallback regex extraction when AI fails to parse receipt.
 * Searches for common patterns like "TOTAL 22215,50" or "Total: $22.215"
 */
function extractAmountWithRegex(ocrText: string): number | null {
  // Normalize text: uppercase, remove extra spaces
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
      if (amount && amount > 0 && amount < 10000000) {
        return amount;
      }
    }
  }
  
  // Pattern 2: Look for the largest amount near "TOTAL" keyword
  const totalIndex = text.lastIndexOf('TOTAL');
  if (totalIndex !== -1) {
    // Search in a window of 100 chars after TOTAL
    const window = text.slice(totalIndex, totalIndex + 100);
    const amounts = window.match(/[\d.,]+/g) || [];
    
    let maxAmount = 0;
    for (const amtStr of amounts) {
      const amt = parseArgentineAmount(amtStr);
      if (amt && amt > maxAmount && amt < 10000000) {
        maxAmount = amt;
      }
    }
    if (maxAmount > 100) { // Minimum reasonable total
      return maxAmount;
    }
  }
  
  return null;
}

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
```

- [ ] **Step 2: Integrate fallback into parseReceiptText**

Modify the `parseReceiptText` function to try regex fallback:

```typescript
export async function parseReceiptText(ocrText: string): Promise<ParsedReceipt | null> {
  const client = getGroqClient();
  
  // If no Groq client, try regex fallback
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
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/ai/parse-receipt.ts
git commit -m "feat: add regex fallback for receipt amount extraction

When AI fails to parse amount, try regex patterns:
- TOTAL followed by amount
- IMPORTE TOTAL patterns
- Largest amount near TOTAL keyword

Handles Argentine number format (dots for thousands, comma for decimals)"
```

---

### Task 2: Improve UX When Amount Detection Fails

**Files:**
- Modify: `lib/telegram/handlers.ts` (receipt handling section, ~line 1305)

- [ ] **Step 1: Update error message with manual input button**

Find the section that handles `!amount_ars` (around line 1305) and update:

```typescript
    if (!amount_ars) {
      // Save receipt with failed status but allow manual input
      const { setConversationState } = await import("./splits/conversation-state");
      await setConversationState(chatId, String(msg.from.id), {
        step: "receipt_manual_amount",
        data: {
          receipt_id: receiptId,
          ocr_text: ocrText.slice(0, 500),
          merchant: merchant ?? null,
          category_slug: slug ?? null,
        },
      });

      return {
        text: [
          `📷 <b>Texto del ticket (OCR):</b>`,
          `<code>${escapeHtml(ocrText.slice(0, 300))}</code>`,
          ``,
          `❌ No pude detectar el monto automáticamente.`,
          ``,
          `📝 <b>Escribí o decí el monto</b> (ej: 22000)`,
          `O decí <b>cancelar</b> para salir.`,
        ].join("\n"),
      };
    }
```

- [ ] **Step 2: Add handler for receipt_manual_amount state**

Add this handler after the existing receipt edit handlers (around line 780):

```typescript
    // ── Receipt manual amount entry (when OCR couldn't detect amount) ────────
    if (editState?.step === "receipt_manual_amount") {
      const rd = editState.data as {
        receipt_id: string;
        ocr_text: string;
        merchant: string | null;
        category_slug: string | null;
      };
      
      // Check for cancel
      const cancelKeywords = ["cancelar", "cancela", "cancel", "salir", "no", "nada"];
      const normalizedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (cancelKeywords.some(k => normalizedText.includes(k))) {
        await clearConversationState(chatId, String(msg.from.id));
        return { text: "❌ Registro de ticket cancelado." };
      }
      
      const amount = parseAmountFromText(text);
      if (!amount || amount <= 0) {
        return { 
          text: [
            `❌ No entendí el monto.`,
            ``,
            `Escribí o decí el número, ej:`,
            `• <code>22000</code>`,
            `• <code>22 mil</code>`,
            ``,
            `O decí <b>cancelar</b> para salir.`,
          ].join("\n"),
        };
      }

      // Update the receipt import with the manual amount
      try {
        await db.update(receipt_imports)
          .set({ 
            parsed_amount_ars: amount,
            status: "pending",
            fail_reason: null,
          })
          .where(eq(receipt_imports.id, rd.receipt_id));
      } catch (err) {
        console.error("Failed to update receipt with manual amount:", err);
        await clearConversationState(chatId, String(msg.from.id));
        return { text: "❌ Error al guardar. Intentá nuevamente." };
      }

      // Clear old state and show category selection or confirmation
      await clearConversationState(chatId, String(msg.from.id));

      // If we have a category, show confirmation
      if (rd.category_slug) {
        const cat = await db.query.categories.findFirst({
          where: and(eq(categories.slug, rd.category_slug), eq(categories.group_id, groupId)),
        });
        
        if (cat) {
          return buildReceiptProposalMessage({
            amount_ars: amount,
            categoryName: cat.name,
            categoryEmoji: cat.emoji,
            merchant: rd.merchant ?? undefined,
            date: getArgentinaDate().toISOString().slice(0, 10),
            source: "ocr",
          });
        }
      }

      // No category - show category selection
      return buildCategoryKeyboard(groupId, amount, rd.merchant ?? undefined, rd.receipt_id, chatId, String(msg.from.id));
    }
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/telegram/handlers.ts
git commit -m "feat: add manual amount input for failed receipt OCR

When OCR can't detect amount:
- Start receipt_manual_amount conversational flow
- User can type/voice amount (supports '22 mil', 'veintidos mil')
- Cancel option available
- Updates receipt and continues normal flow"
```

---

### Task 3: Test and Verify

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Push changes**

```bash
git push origin main
```

- [ ] **Step 3: Document test cases**

Manual testing required:
1. Send receipt photo where TOTAL is clearly visible
2. Verify amount is extracted (either by AI or regex fallback)
3. Send receipt photo with corrupted/hard to read TOTAL
4. Verify manual input flow starts
5. Enter amount manually (text: "22000" or voice: "veintidos mil")
6. Verify category selection appears
7. Complete expense registration

---
