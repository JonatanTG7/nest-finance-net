import { createFileRoute } from "@tanstack/react-router";
import { sendDigestsForToday } from "@/lib/email-digest.server";

/**
 * POST /api/send-digests — sends every email digest due today.
 *
 * Triggered daily by cron (pg_cron via pg_net, or any external scheduler).
 * Authenticated with a bearer secret (DIGEST_CRON_SECRET env var) — the
 * route fails closed when the secret isn't configured. Sending is
 * idempotent: a member already sent today (same kind) is skipped, so
 * retries are safe. Returns { sent, skipped, errors }.
 */
export const Route = createFileRoute("/api/send-digests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.DIGEST_CRON_SECRET;
        const auth = request.headers.get("authorization");
        if (!secret || auth !== `Bearer ${secret}`) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        try {
          const result = await sendDigestsForToday();
          return Response.json(result);
        } catch (e) {
          console.error("[digest] send-digests failed", e);
          return new Response(JSON.stringify({ error: "internal" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
