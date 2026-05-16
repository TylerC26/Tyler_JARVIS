// Generates a resolved launchd plist from the .example template and copies it
// into ~/Library/LaunchAgents/. Run once after editing ~/.jarvis/mac-agent.env
// and ~/.jarvis/mac-agent.toml.
//
//   npm run agent:install
//
// Then load the service:
//   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jarvis.mac-agent.plist
//   launchctl enable     gui/$(id -u)/com.jarvis.mac-agent

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const LABEL = "com.jarvis.mac-agent";
const TEMPLATE = resolve(__dirname, "com.jarvis.mac-agent.plist.example");
const TARGET_DIR = resolve(homedir(), "Library/LaunchAgents");
const TARGET = resolve(TARGET_DIR, `${LABEL}.plist`);

function which(cmd: string): string {
  try {
    return execSync(`/usr/bin/which ${cmd}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function main(): void {
  const tsxPath = which("tsx") || "/usr/local/bin/tsx";
  const repoDir = resolve(__dirname, "..", "..");
  const envFile = resolve(homedir(), ".jarvis/mac-agent.env");
  const logDir = resolve(homedir(), "Library/Logs");
  const stdoutPath = resolve(logDir, "jarvis-mac-agent.out.log");
  const stderrPath = resolve(logDir, "jarvis-mac-agent.err.log");

  let template: string;
  try {
    template = readFileSync(TEMPLATE, "utf8");
  } catch {
    console.error(`Template not found at ${TEMPLATE}`);
    process.exit(1);
  }

  const resolved = template
    .replaceAll("__TSX_PATH__", tsxPath)
    .replaceAll("__REPO_DIR__", repoDir)
    .replaceAll("__ENV_FILE__", envFile)
    .replaceAll("__STDOUT_PATH__", stdoutPath)
    .replaceAll("__STDERR_PATH__", stderrPath)
    .replaceAll("__PATH__", process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin");

  mkdirSync(TARGET_DIR, { recursive: true });
  writeFileSync(TARGET, resolved, "utf8");

  console.log(`✓ Wrote ${TARGET}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  launchctl bootstrap gui/$(id -u) ${TARGET}`);
  console.log(`  launchctl enable     gui/$(id -u)/${LABEL}`);
  console.log("");
  console.log("To stop and remove the service later:");
  console.log(`  launchctl bootout    gui/$(id -u)/${LABEL}`);
}

main();
