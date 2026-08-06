import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VoucherExtraction = {
  label: string | null;
  amount: number | null;
  currency: string;
  barcode: string | null;
  expiry_date: string | null;
  confidence: "high" | "low";
};

const EMPTY: VoucherExtraction = {
  label: null,
  amount: null,
  currency: "ILS",
  barcode: null,
  expiry_date: null,
  confidence: "low",
};

const PROMPT = `You read photos of gift cards / vouchers (Israeli: תן ביס, תו הזהב, Be Pharm, BUYME…).
Return ONLY a JSON object matching this schema, no prose, no markdown fences.
If a field is not visible, use null.
{
  "label": string | null,        // merchant / voucher name, in Hebrew if the voucher is Hebrew
  "amount": number | null,       // face value as a number, e.g. 30.00
  "currency": string,            // "ILS" if not detected
  "barcode": string | null,      // digits only
  "expiry_date": string | null,  // ISO yyyy-mm-dd
  "confidence": "high" | "low"
}`;

function parseExtraction(raw: string): VoucherExtraction {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const json = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    const o = JSON.parse(json) as Record<string, unknown>;
    const amount =
      typeof o.amount === "number"
        ? o.amount
        : typeof o.amount === "string" && o.amount.trim() !== "" && !isNaN(Number(o.amount))
          ? Number(o.amount)
          : null;
    const barcode =
      typeof o.barcode === "string" ? o.barcode.replace(/\D/g, "") || null : null;
    const expiry =
      typeof o.expiry_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.expiry_date)
        ? o.expiry_date
        : null;
    return {
      label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : null,
      amount,
      currency: typeof o.currency === "string" && o.currency.trim() ? o.currency.trim() : "ILS",
      barcode,
      expiry_date: expiry,
      confidence: o.confidence === "high" ? "high" : "low",
    };
  } catch (e) {
    console.error("[vouchers] parse error", e);
    return EMPTY;
  }
}

async function viaAnthropic(
  apiKey: string,
  imageBase64: string,
  mediaType: string,
): Promise<string | null> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: "Extract the voucher fields as JSON." },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    console.error("[vouchers] anthropic error", r.status, await r.text());
    return null;
  }
  const j = (await r.json()) as { content?: { type: string; text?: string }[] };
  return j.content?.find((c) => c.type === "text")?.text ?? null;
}

async function viaLovableGateway(
  apiKey: string,
  imageBase64: string,
  mediaType: string,
): Promise<string | null> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 300,
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the voucher fields as JSON." },
            {
              type: "image_url",
              image_url: { url: `data:${mediaType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });
  if (!r.ok) {
    console.error("[vouchers] gateway error", r.status, await r.text());
    return null;
  }
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? null;
}

export const extractVoucherData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageBase64: string; mediaType: string }) => data)
  .handler(async ({ data }): Promise<VoucherExtraction> => {
    const mediaType = data.mediaType?.startsWith("image/") ? data.mediaType : "image/jpeg";
    const base64 = (data.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!base64) return EMPTY;

    try {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      const lovableKey = process.env.LOVABLE_API_KEY;
      let raw: string | null = null;
      if (anthropicKey) raw = await viaAnthropic(anthropicKey, base64, mediaType);
      if (!raw && lovableKey) raw = await viaLovableGateway(lovableKey, base64, mediaType);
      if (!raw) return EMPTY;
      return parseExtraction(raw);
    } catch (e) {
      console.error("[vouchers] extraction failed", e);
      return EMPTY;
    }
  });
