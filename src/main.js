// EchoCode: wires the editor, Python, sound, voice and visuals together.

import { createEditor } from "./editor.js";
import { PythonRunner } from "./python.js";
import { EXAMPLES, getExample } from "./examples.js";
import { AudioEngine } from "./audio.js";
import { buildScore } from "./sonify.js";
import { analyze } from "./analyze.js";
import { Speech } from "./speech.js";
import { Explorer } from "./explore.js";
import { SpaceView, PitchView } from "./overlay.js";

const $ = (id) => document.getElementById(id);
const els = {
  status: $("status-pill"),
  mode: $("mode-pill"),
  output: $("output"),
  caption: $("caption"),
  select: $("example-select"),
  rate: $("rate"),
};

// ------------------------------------------------------------------ captions
// Show the spoken text on screen, with `code` rendered as code.
function showCaption(text, tone = "info") {
  els.caption.className = "caption" + (tone === "ok" ? " ok" : tone === "err" ? " err" : "");
  els.caption.replaceChildren();
  String(text).split(/(`[^`]*`)/g).forEach((part) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      const code = document.createElement("code");
      code.textContent = part.slice(1, -1);
      els.caption.append(code);
    } else if (part) {
      els.caption.append(part);
    }
  });
}

// ------------------------------------------------------------------ services
const audio = new AudioEngine();
const space = new SpaceView($("space"));
const pitch = new PitchView($("pitch"));

const ENDING_LABEL = {
  "runaway-recursion": "never came back ↑",
  "runaway-loop": "never stopped ⟳",
  ok: "came back ✓",
  error: "error ✕",
  syntax: "syntax error ✕",
  timeout: "too long ✕",
  budget: "too many steps ✕",
};

function stepLabel(step) {
  if (step.sound === "call") {
    const values = (step.args || "").split(", ").map((a) => a.split("=")[1]).join(", ");
    return `${step.fn}(${values})`;
  }
  if (step.sound === "return") return `← ${step.fn}`;
  if (step.sound === "tick") return `loop, line ${step.loop}`;
  return "";
}
const speech = new Speech({ liveRegion: $("live"), onSay: showCaption });

let pythonReady = false;
const python = new PythonRunner({
  onStatus(state) {
    pythonReady = state === "ready";
    els.status.className = "pill " + (pythonReady ? "pill-ok" : state === "failed" ? "pill-err" : "pill-wait");
    els.status.textContent = pythonReady ? "Python ready" : state === "failed" ? "Python failed to load" : "Loading Python…";
  },
});

const app = {
  running: false,
  lastResult: null,
  lastAnalysis: null,
};
window.echocode = app; // handy for debugging and automated tests

// ------------------------------------------------------------------ run
async function run() {
  audio.ensure(); // browsers only allow audio inside a key press or click
  if (app.running) stop({ silent: true });
  if (!pythonReady) {
    speech.say("Python is still loading. Try again in a moment.");
    return;
  }
  app.running = true;
  const runId = (app.runId = (app.runId || 0) + 1);
  speech.stop();
  showCaption("Running…");

  const result = await python.run(editor.getCode());
  if (runId !== app.runId) return; // stopped or replaced while Python was running
  app.lastResult = result;
  els.output.textContent = result.output || "";

  const analysis = analyze(result);
  app.lastAnalysis = analysis;
  const score = buildScore(result);
  app.lastScore = score;
  pitch.reset(score);

  const finished = await audio.play(score, {
    onStep(step) {
      editor.highlightLine(step.line);
      pitch.add(step);
      space.ping({ pos: step.pos, kind: step.sound, label: stepLabel(step) });
    },
  });
  if (!finished || runId !== app.runId) return;

  const ok = analysis.tone === "ok";
  const hasCalls = score.steps.some((s) => s.sound === "call");
  pitch.end(analysis.tone, ok ? (hasCalls ? "came back down ✓" : "done ✓") : ENDING_LABEL[analysis.kind] || "problem ✕");
  space.ping({ pos: { x: 0, y: 0.3, z: -1 }, kind: ok ? "done" : "error", label: ok ? "✓ chime" : "✕ buzz" });
  editor.highlightLine(analysis.line, ok ? "ok" : "error");
  speech.say(analysis.text, { tone: analysis.tone });
  app.running = false;
  app.lastFinishedAt = Date.now();
}

function stop({ silent = false } = {}) {
  app.runId = (app.runId || 0) + 1;
  const wasRunning = app.running || audio.playing;
  audio.stop();
  app.running = false;
  editor.highlightLine(null);
  if (!silent) speech.say(wasRunning ? "Stopped." : "Nothing is running.");
}

// ------------------------------------------------------------------ examples
function loadExample(id, { announce = true } = {}) {
  const ex = getExample(id);
  if (explorer.active) explorer.setActive(false);
  stop({ silent: true });
  editor.setCode(ex.code);
  els.select.value = ex.id;
  els.output.textContent = "";
  editor.highlightLine(null);
  pitch.reset();
  if (announce) speech.say(`Loaded example: ${ex.title}.`);
}

// ------------------------------------------------------------------ help
const HELP =
  "Keys. Control Enter runs your code and plays it as sound. " +
  "Notes going up mean a function calling deeper; going down means returning. " +
  "Ticks are loop rounds. A chime means it finished; a buzz means a problem. " +
  "Control period stops. Control E explores your code by sound. " +
  "Control R repeats the last message. Alt 1 to 7 loads an example. Alt V hides the visuals.";

// ------------------------------------------------------------------ editor + keys
const editor = createEditor($("editor"), { doc: EXAMPLES[0].code });

const explorer = new Explorer({
  element: $("explorer"),
  breadcrumb: $("breadcrumb"),
  editor,
  python,
  audio,
  speech,
  onSound: (info) => space.ping(info),
  onModeChange(on) {
    els.mode.textContent = on ? "Exploring" : "Editing";
    els.mode.className = "pill" + (on ? " pill-explore" : "");
  },
});

async function toggleExplore() {
  if (!pythonReady) return speech.say("Python is still loading. Try again in a moment.");
  stop({ silent: true });
  await explorer.toggle();
}

// Shortcuts that work anywhere on the page. Registered in the capture phase
// and stopped there, so the editor never also handles them.
document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === "Enter") { e.preventDefault(); run(); }
  else if (mod && e.key === ".") { e.preventDefault(); stop(); }
  else if (mod && (e.key === "r" || e.key === "R")) { e.preventDefault(); speech.repeat(); }
  else if (mod && (e.key === "e" || e.key === "E")) { e.preventDefault(); toggleExplore(); }
  else if (e.key === "F1") { e.preventDefault(); speech.say(HELP); }
  else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
    const ex = EXAMPLES[Number(e.code.slice(5)) - 1];
    if (ex) { e.preventDefault(); loadExample(ex.id); }
  } else if (e.altKey && e.code === "KeyV") {
    e.preventDefault();
    document.body.classList.toggle("visuals-off");
  } else return;
  e.stopPropagation();
}, true);

// ------------------------------------------------------------------ toolbar
for (const ex of EXAMPLES) els.select.add(new Option(ex.title, ex.id));
els.select.addEventListener("change", () => loadExample(els.select.value));
$("run-btn").addEventListener("click", run);
$("stop-btn").addEventListener("click", () => stop());
$("explore-btn").addEventListener("click", toggleExplore);
els.rate.addEventListener("input", () => (speech.rate = Number(els.rate.value)));
speech.rate = Number(els.rate.value);

Object.assign(app, { run, stop, loadExample, toggleExplore, editor, speech, audio, python, explorer });
