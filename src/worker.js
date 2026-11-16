// Web Worker: runs real Python (Pyodide) off the main thread.
//
// Why a worker? If the student's code loops forever, it would freeze the page.
// In a worker it runs on its own thread, the page stays responsive, and the
// main thread can kill the worker at any time (see python.js).
//
// Messages in:  { id, type: "init" | "parse" | "run", code?, baseUrl? }
// Messages out: { id, ok: true, result } or { id, ok: false, error }

import helpersSource from "./helpers.py?raw";

let pyodide = null;
let parseTree = null;
let traceRun = null;

async function init(baseUrl) {
  if (pyodide) return { version: pyodide.version };
  const indexURL = new URL("pyodide/", baseUrl).href;
  const { loadPyodide } = await import(/* @vite-ignore */ indexURL + "pyodide.mjs");
  pyodide = await loadPyodide({ indexURL });
  pyodide.FS.writeFile("/home/pyodide/echocode_helpers.py", helpersSource);
  pyodide.runPython("import sys; sys.path.insert(0, '/home/pyodide')");
  const helpers = pyodide.pyimport("echocode_helpers");
  parseTree = helpers.parse_tree;
  traceRun = helpers.trace_run;
  return { version: pyodide.version };
}

// Convert a Python dict into a plain JS object that can be posted.
function toJs(pyResult) {
  try {
    return pyResult.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false });
  } finally {
    pyResult.destroy();
  }
}

self.onmessage = async (event) => {
  const { id, type, code, baseUrl } = event.data;
  try {
    let result;
    if (type === "init") result = await init(baseUrl);
    else if (type === "parse") result = toJs(parseTree(code));
    else if (type === "run") result = toJs(traceRun(code));
    else throw new Error(`Unknown message type: ${type}`);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
