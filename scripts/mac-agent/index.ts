// Entry point. launchd boots this on user login and keeps it alive. SIGTERM
// (sent by `launchctl bootout` or system shutdown) drains gracefully.

import { assertRequiredEnv, loadDaemonConfig, loadEnvFile } from "./config";
import { log } from "./log";
import { start } from "./subscribe";

async function main(): Promise<void> {
  loadEnvFile();
  assertRequiredEnv();
  const cfg = loadDaemonConfig();

  log.info("jarvis-mac-agent starting", {
    repos: cfg.repos.map((r) => r.slug),
    agent_timeout_seconds: cfg.daemon.agent_timeout_seconds,
  });

  const stop = await start(cfg);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`received ${signal}, shutting down`);
    try {
      await stop();
    } catch (e) {
      log.warn("shutdown error", { error: String(e) });
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Keep alive forever.
  await new Promise<void>(() => {});
}

main().catch((e) => {
  log.error("fatal", { error: String(e), stack: e instanceof Error ? e.stack : undefined });
  process.exit(1);
});
