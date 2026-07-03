/**
 * Server-side cron scheduler — self-pings /api/workflow/cron every 60 seconds
 * to ensure scheduled workflows and wait_delay entries fire even when no browser is open.
 *
 * Imported once at server startup (via a global flag to prevent duplicate intervals).
 */

const POLL_INTERVAL_MS = 60_000; // 60 seconds

let _cronTimer: ReturnType<typeof setInterval> | null = null;

export function startServerCron() {
  if (_cronTimer) return; // already running (idempotent in dev hot-reload)
  if (typeof window !== "undefined") return; // safety: only run on server

  const port = process.env.PORT || 3000;
  const baseUrl = process.env.DASHBOARD_URL || `http://localhost:${port}`;

  _cronTimer = setInterval(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/workflow/cron`, {
        method: "GET",
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = await res.json();
        const totalResults = data.results?.length || 0;
        if (totalResults > 0) {
          console.log(`[ServerCron] Fired at ${new Date().toISOString()} — ${totalResults} result(s)`);
        }
      }
    } catch (err: any) {
      // Only log non-ECONNREFUSED errors (server might be starting up)
      if (!err?.cause?.code?.includes("ECONNREFUSED")) {
        console.warn(`[ServerCron] Ping failed: ${err.message}`);
      }
    }
  }, POLL_INTERVAL_MS);

  console.log(`[ServerCron] Started — polling every ${POLL_INTERVAL_MS / 1000}s`);
}

// Auto-start when this module is imported on the server side
// (Next.js imports server modules at startup)
startServerCron();
