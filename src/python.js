// Talks to the Python worker (worker.js).
//
// The worker is like a second program running at the same time. If the
// student's code freezes, only the worker freezes, not the whole page,
// and we can just kill it and start a new one.

const TIME_LIMIT = 12000; // 12 seconds, then we give up on the code

let worker = null;
let nextId = 1;
let waiting = {};        // id -> { resolve, reject, timer } for messages we're waiting on
let pythonReady = false;
let loading = null;      // promise that finishes when Python has loaded
let statusCallback = null;

export function startPython(onStatus) {
  statusCallback = onStatus;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

  // when the worker answers, find who was waiting for that answer
  worker.onmessage = function (event) {
    const message = event.data;
    const waiter = waiting[message.id];
    if (!waiter) return;
    delete waiting[message.id];
    clearTimeout(waiter.timer);
    if (message.ok) waiter.resolve(message.result);
    else waiter.reject(new Error(message.error));
  };

  pythonReady = false;
  statusCallback("loading");
  // loading Python can take a while the first time (it's about 10 MB)
  loading = sendToWorker("init", { baseUrl: document.baseURI }, 120000)
    .then(function (info) {
      pythonReady = true;
      statusCallback("ready");
      return info;
    })
    .catch(function (err) {
      statusCallback("failed");
      throw err;
    });
}

// send a message and get a promise for the answer
function sendToWorker(type, data, timeLimit) {
  const id = nextId;
  nextId++;
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      delete waiting[id];
      const err = new Error("timeout");
      err.timeout = true;
      reject(err);
      restartPython(); // the code is probably stuck, so start fresh
    }, timeLimit);
    waiting[id] = { resolve, reject, timer };
    worker.postMessage({ id: id, type: type, ...data });
  });
}

function restartPython() {
  worker.terminate();
  // anyone still waiting gets told it was stopped
  for (const id in waiting) {
    clearTimeout(waiting[id].timer);
    waiting[id].reject(new Error("stopped"));
  }
  waiting = {};
  startPython(statusCallback);
}

export function isPythonReady() {
  return pythonReady;
}

export async function parseCode(code) {
  await loading;
  return sendToWorker("parse", { code: code }, TIME_LIMIT);
}

export async function runCode(code) {
  await loading;
  try {
    return await sendToWorker("run", { code: code }, TIME_LIMIT);
  } catch (err) {
    if (err.timeout) {
      // same shape as a normal result so the rest of the app doesn't break
      return { status: "timeout", events: [], output: "", loops: [], functions: {},
               loopSnapshots: {}, maxDepth: 0, steps: 0 };
    }
    throw err;
  }
}
