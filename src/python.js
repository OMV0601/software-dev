// Main-thread client for the Python worker.
//
// - Sends requests and matches replies by id.
// - Has a hard time limit: if a run takes too long, the worker is terminated
//   and a fresh one is started. This is the last line of defence against code
//   that hangs in a way the step budget can't catch.

const RUN_TIMEOUT_MS = 12000;

export class PythonRunner {
  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus;
    this.nextId = 1;
    this.pending = new Map();
    this.ready = null;
    this.start();
  }

  start() {
    this.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    this.worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      clearTimeout(p.timer);
      ok ? p.resolve(result) : p.reject(new Error(error));
    };
    this.onStatus("loading");
    this.ready = this.request("init", { baseUrl: document.baseURI }, 120000).then(
      (info) => {
        this.onStatus("ready", info);
        return info;
      },
      (err) => {
        this.onStatus("failed", { error: err.message });
        throw err;
      },
    );
  }

  request(type, payload = {}, timeoutMs = RUN_TIMEOUT_MS) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error("timeout"), { timeout: true }));
        this.restart();
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, type, ...payload });
    });
  }

  restart() {
    this.worker.terminate();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Object.assign(new Error("stopped"), { stopped: true }));
    }
    this.pending.clear();
    this.start();
  }

  async parse(code) {
    await this.ready;
    return this.request("parse", { code });
  }

  async run(code) {
    await this.ready;
    try {
      return await this.request("run", { code });
    } catch (err) {
      if (err.timeout) return { status: "timeout", events: [], output: "", loops: [], functions: {}, loopSnapshots: {}, maxDepth: 0, steps: 0 };
      throw err;
    }
  }
}
