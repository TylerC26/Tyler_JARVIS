// Tiny structured logger. launchd captures stdout/stderr to file paths in the
// plist; we just need timestamps + level so the log is greppable.

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold = LEVELS.info;

export function setLogLevel(level: Level | string): void {
  const k = (level as Level) in LEVELS ? (level as Level) : "info";
  threshold = LEVELS[k];
}

function emit(level: Level, msg: string, ctx?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return;
  const ts = new Date().toISOString();
  const ctxStr = ctx ? " " + JSON.stringify(ctx) : "";
  const line = `${ts} [${level}] ${msg}${ctxStr}`;
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};
