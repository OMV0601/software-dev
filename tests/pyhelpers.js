// Runs the real Python helpers (under CPython) so JS tests use genuine traces.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./trace.py", import.meta.url));

export function pyTrace(code) {
  return JSON.parse(execFileSync("python3", [script, "run"], { input: code, encoding: "utf8" }));
}

export function pyParse(code) {
  return JSON.parse(execFileSync("python3", [script, "parse"], { input: code, encoding: "utf8" }));
}
