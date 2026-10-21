import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReceiptScan = {
  ok: boolean;
  error?: string;
  amount: number | null;
  merchant: string | null;
  date: string | null;
  category: string | null;
};

const EMPTY: ReceiptScan = { ok: false, amount: null, merchant: null, date: null, category: null };

// The photo is only sent for reading and never stored anywhere.
export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { imageBase64: string; mediaType: string; categories: string[] }) => d,
  )
  .handler(async ({ data }): Promise<ReceiptScan> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ...EMPTY, error: "שירות הסריקה לא מוגדר" };
    const base64 = (data.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!base64) return { ...EMPTY, error: "לא התקבלה תמונה" };
    const mediaType = data.mediaType?.startsWith("image/") ? data.mediaType : "image/jpeg";
    const cats = (data.categories || []).slice(0, 80).join(", ");
    const prompt = `You read photos of receipts (mostly Israeli, Hebrew). Return ONLY JSON:
{"amount": number|null (final total paid), "merchant": string|null (business name, as written),
"date": "yyyy-mm-dd"|null, "category": string|null (exactly one of: ${cats}; null if none fits)}`;
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "google/gemini-3.8-flash",
          max_tokens: 300,
          messages: [
            { role: "system", content: prompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract the receipt fields as JSON." },
                { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
              ],
            },
          ],
        }),
      });
      if (!r.ok) {
        console.error("[receipts] gateway", r.status, await r.text());
        if (r.status === 402) return { ...EMPTY, error: "נגמרה מכסת ה־AI החודשית" };
        if (r.status === 429) return { ...EMPTY, error: "יותר מדי בקשות, נסה שוב בעוד רגע" };
        return { ...EMPTY, error: "הסריקה נכשלה" };
      }
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = j.choices?.[0]?.message?.content ?? "";
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      const o = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
      const amt = Number(o.amount);
      return {
        ok: true,
        amount: o.amount != null && isFinite(amt) && amt > 0 ? amt : null,
        merchant: typeof o.merchant === "string" && o.merchant.trim() ? o.merchant.trim() : null,
        date:
          typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null,
        category: typeof o.category === "string" ? o.category : null,
      };
    } catch (err) {
      console.error("[receipts] failed", err);
      return { ...EMPTY, error: "לא הצלחנו לקרוא את החשבונית" };
    }
  });
