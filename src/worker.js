// This runs in a Web Worker (a separate thread), so if the student's code
// loops forever, the page doesn't freeze.
//
// It loads Pyodide (real Python compiled to WebAssembly) and runs our
// helpers.py functions when the main page asks.

import helpersCode from "./helpers.py?raw"; // Vite gives us the file as a string

let pyodide = null;
let parseTree = null;
let traceRun = null;

async function loadPython(baseUrl) {
  if (pyodide) return { version: pyodide.version };
  // Pyodide's files are in public/pyodide (copied there by scripts/copy-pyodide.mjs)
  const folder = new URL("pyodide/", baseUrl).href;
  const pyodideModule = await import(/* @vite-ignore */ folder + "pyodide.mjs");
  pyodide = await pyodideModule.loadPyodide({ indexURL: folder });

  // save helpers.py into Pyodide's pretend file system, then import it
  pyodide.FS.writeFile("/home/pyodide/echocode_helpers.py", helpersCode);
  pyodide.runPython("import sys; sys.path.insert(0, '/home/pyodide')");
  const helpers = pyodide.pyimport("echocode_helpers");
  parseTree = helpers.parse_tree;
  traceRun = helpers.trace_run;
  return { version: pyodide.version };
}

// Python dictionaries have to be turned into JS objects before sending them
function toJavaScript(pythonValue) {
  const value = pythonValue.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false });
  pythonValue.destroy(); // free the memory
  return value;
}

self.onmessage = async function (event) {
  const { id, type, code, baseUrl } = event.data;
  try {
    let result;
    if (type === "init") {
      result = await loadPython(baseUrl);
    } else if (type === "parse") {
      result = toJavaScript(parseTree(code));
    } else if (type === "run") {
      result = toJavaScript(traceRun(code));
    } else {
      throw new Error("Unknown message type: " + type);
    }
    self.postMessage({ id: id, ok: true, result: result });
  } catch (err) {
    self.postMessage({ id: id, ok: false, error: String(err.message || err) });
  }
};
