import { writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

/** Resolved directory */
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Debug log file path */
const LOG_PATH = resolve(__dirname, "../../debug.log");

/**
 * Clear the debug log file and open a new cmd window to tail it.
 */
export function openDebugWindow(): void {
  writeFileSync(LOG_PATH, "", { encoding: "utf-8" });
  spawn("cmd", ["/c", "start", "cmd", "/k", `powershell -Command "Get-Content -Path '${LOG_PATH}' -Wait -Encoding UTF8"`], {
    shell: true,
    detached: true,
    stdio: "ignore",
  });
}

/**
 * Append a message to the debug log file.
 *
 * @param message - Message to log
 */
export function debugLog(message: string): void {
  writeFileSync(LOG_PATH, message, { flag: "a", encoding: "utf-8" });
}

/**
 * Append a line to the debug log file.
 *
 * @param line - Line to log
 */
export function debugLine(line: string): void {
  debugLog(line + "\n");
}
