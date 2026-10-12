const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "king-of-farmer-cloudflare-test", mode: "migration-scaffold" });
    }

    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      // This endpoint is intentionally not connected to game logic yet.
      // It only verifies the configured webhook secret and acknowledges the request.
      const supplied = request.headers.get("x-telegram-bot-api-secret-token") || "";
      if (!env.WEBHOOK_SECRET || supplied !== env.WEBHOOK_SECRET) {
        return json({ ok: false, error: "Webhook secret mismatch" }, 401);
      }
      // Do not log update bodies: they may contain personal information.
      return json({ ok: true, received: true, note: "Webhook transport test only; bot commands are not migrated yet." });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        ok: false,
        error: "Game API not migrated yet",
        message: "This package preserves the original Python game and includes a Cloudflare deployment scaffold. Do not point the production bot here yet."
      }, 501);
    }

    return env.ASSETS.fetch(request);
  },
};
