// Copies the Pyodide runtime (Python compiled to WebAssembly) into public/pyodide
// so the app serves Python itself and works fully offline. No CDN needed.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pyodide");
const dest = join(root, "public", "pyodide");
const files = [
  "pyodide.mjs",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

if (!existsSync(src)) {
  console.error("pyodide is not installed. Run `npm install` first.");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of files) cpSync(join(src, f), join(dest, f));
console.log(`Copied Pyodide runtime to ${dest}`);
