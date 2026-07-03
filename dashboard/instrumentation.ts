/**
 * Next.js Instrumentation — runs once when the server starts.
 * Used to bootstrap the server-side cron scheduler.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamic import to avoid bundling in edge/client
    await import("./lib/cron-scheduler");
  }
}
