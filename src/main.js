// EchoCode main file: connects the editor, Python, sound, voice and visuals.

import { setupEditor, getCode, setCode, highlightLine, getCurrentLine } from "./editor.js";
import { startPython, isPythonReady, runCode } from "./python.js";
import { EXAMPLES, getExample } from "./examples.js";
import { startAudio, playScore, stopSound, isPlaying } from "./audio.js";
import { buildScore } from "./sonify.js";
import { analyze } from "./analyze.js";
import { setupSpeech, say, repeatLast, stopTalking, setVoiceSpeed } from "./speech.js";
import { setupExplorer, toggleExplore, isExploring, setExploring } from "./explore.js";
import { setupVisuals, addSoundDot, resetPitchGraph, addPitchStep, finishPitchGraph } from "./overlay.js";

const statusPill = document.getElementById("status-pill");
const modePill = document.getElementById("mode-pill");
const outputBox = document.getElementById("output");
const caption = document.getElementById("caption");
const exampleSelect = document.getElementById("example-select");
const speedSlider = document.getElementById("rate");

let running = false;
let runNumber = 0; // goes up every run, so an old run knows it got replaced

// the automated test (tests/e2e.mjs) reads these to check things worked
window.echocode = {
  lastScore: null,
  lastFinishedAt: 0,
  isExploring: isExploring,
  isPlaying: isPlaying,
  getCurrentLine: getCurrentLine,
  setCode: setCode,
};

// ---------- captions ----------
// shows what the voice says on screen. Parts in `backticks` show as code.
function showCaption(text, tone) {
  caption.className = "caption";
  if (tone === "ok") caption.className = "caption ok";
  if (tone === "err") caption.className = "caption err";
  caption.innerHTML = "";
  const parts = String(text).split("`");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    if (i % 2 === 1) {
      const code = document.createElement("code");
      code.textContent = parts[i];
      caption.appendChild(code);
    } else {
      caption.appendChild(document.createTextNode(parts[i]));
    }
  }
}

// ---------- setup ----------
setupSpeech(document.getElementById("live"), showCaption);
setupVisuals(document.getElementById("space"), document.getElementById("pitch"));
setupEditor(document.getElementById("editor"), EXAMPLES[0].code);

startPython(function (state) {
  if (state === "ready") {
    statusPill.className = "pill pill-ok";
    statusPill.textContent = "Python ready";
  } else if (state === "failed") {
    statusPill.className = "pill pill-err";
    statusPill.textContent = "Python failed to load";
    say("Python failed to load. Please reload the page.", "err");
  } else {
    statusPill.className = "pill pill-wait";
    statusPill.textContent = "Loading Python…";
  }
});

setupExplorer({
  panel: document.getElementById("explorer"),
  breadcrumb: document.getElementById("breadcrumb"),
  onSound: function (info) {
    addSoundDot(info.pos, info.kind, info.label);
  },
  onModeChange: function (on) {
    modePill.textContent = on ? "Exploring" : "Editing";
    modePill.className = on ? "pill pill-explore" : "pill";
  },
});

// ---------- running code ----------

// the label next to each dot on the head view
function stepLabel(step) {
  if (step.sound === "call") {
    // "n=3" -> "countdown(3)"
    const values = [];
    for (const arg of (step.args || "").split(", ")) values.push(arg.split("=")[1]);
    return step.fn + "(" + values.join(", ") + ")";
  }
  if (step.sound === "return") return "← " + step.fn;
  if (step.sound === "tick") return "loop, line " + step.loop;
  return "";
}

// what the pitch graph says at the end
function endingLabel(analysis, score) {
  if (analysis.tone === "ok") {
    let hasCalls = false;
    for (const s of score.steps) if (s.sound === "call") hasCalls = true;
    return hasCalls ? "came back down ✓" : "done ✓";
  }
  if (analysis.kind === "runaway-recursion") return "never came back ↑";
  if (analysis.kind === "runaway-loop") return "never stopped ⟳";
  if (analysis.kind === "syntax") return "syntax error ✕";
  if (analysis.kind === "timeout") return "too long ✕";
  return "error ✕";
}

async function run() {
  startAudio(); // has to happen right when the key is pressed
  if (running) stop(true);
  if (!isPythonReady()) {
    say("Python is still loading. Try again in a moment.");
    return;
  }
  running = true;
  runNumber++;
  const myRun = runNumber;
  stopTalking();
  showCaption("Running…");

  // 1. run the code in Python and get back every step
  const result = await runCode(getCode());
  if (myRun !== runNumber) return; // someone pressed stop or ran again meanwhile
  outputBox.textContent = result.output || "";

  // 2. work out what happened, and turn the steps into sounds
  const analysis = analyze(result);
  const score = buildScore(result);
  window.echocode.lastScore = score;
  resetPitchGraph(score);

  // 3. play it, updating the screen as each sound plays
  const finished = await playScore(score, function (step) {
    highlightLine(step.line);
    addPitchStep(step);
    addSoundDot(step.pos, step.sound, stepLabel(step));
  });
  if (!finished || myRun !== runNumber) return;

  // 4. show and say the result
  const ok = analysis.tone === "ok";
  finishPitchGraph(analysis.tone, endingLabel(analysis, score));
  addSoundDot({ x: 0, y: 0.3, z: -1 }, ok ? "done" : "error", ok ? "✓ chime" : "✕ buzz");
  highlightLine(analysis.line, ok ? "ok" : "error");
  say(analysis.text, analysis.tone);
  running = false;
  window.echocode.lastFinishedAt = Date.now();
}

function stop(quiet) {
  runNumber++;
  const wasRunning = running || isPlaying();
  stopSound();
  running = false;
  highlightLine(null);
  if (!quiet) say(wasRunning ? "Stopped." : "Nothing is running.");
}

// ---------- other actions ----------

function loadExample(id) {
  const example = getExample(id);
  if (isExploring()) setExploring(false);
  stop(true);
  setCode(example.code);
  exampleSelect.value = example.id;
  outputBox.textContent = "";
  highlightLine(null);
  resetPitchGraph(null);
  say("Loaded example: " + example.title + ".");
}

// someone who can't see can't read the output box, so Alt+O reads it out
function readOutput() {
  const lines = outputBox.textContent.split("\n").filter((line) => line !== "");
  if (lines.length === 0) {
    say("No output yet.");
    return;
  }
  const firstLines = lines.slice(0, 12);
  let text = "Output, " + lines.length + (lines.length === 1 ? " line: " : " lines: ") + firstLines.join(", ") + ".";
  if (lines.length > 12) text += " And " + (lines.length - 12) + " more lines.";
  say(text);
}

async function startExplore() {
  if (!isPythonReady()) {
    say("Python is still loading. Try again in a moment.");
    return;
  }
  stop(true);
  await toggleExplore();
}

const HELP_TEXT =
  "Keys. Control Enter runs your code and plays it as sound. " +
  "Notes going up mean a function calling deeper; going down means returning. " +
  "Ticks are loop rounds. A chime means it finished; a buzz means a problem. " +
  "Control period stops. Control E explores your code by sound. " +
  "Control R repeats the last message. Alt O reads the output. Alt 1 to 7 loads an example. Alt V hides the visuals.";

// ---------- keyboard shortcuts ----------
// The "true" at the end means we see the key BEFORE the editor does,
// so Ctrl+Enter runs the code instead of adding a new line.
document.addEventListener("keydown", function (e) {
  const ctrl = e.ctrlKey || e.metaKey; // metaKey = Cmd on a Mac
  const key = e.key.toLowerCase();
  let handled = true;

  if (ctrl && key === "enter") run();
  else if (ctrl && key === ".") stop(false);
  else if (ctrl && key === "r") repeatLast();
  else if (ctrl && key === "e") startExplore();
  else if (e.key === "F1") say(HELP_TEXT);
  else if (e.altKey && e.code === "KeyO") readOutput();
  else if (e.altKey && e.code === "KeyV") document.body.classList.toggle("visuals-off");
  else if (e.altKey && e.code.startsWith("Digit")) {
    // Alt+1 to Alt+7 load the examples. e.code is "Digit1", "Digit2"...
    const number = Number(e.code.replace("Digit", ""));
    if (number >= 1 && number <= EXAMPLES.length) loadExample(EXAMPLES[number - 1].id);
    else handled = false;
  } else handled = false;

  if (handled) {
    e.preventDefault();  // stop the browser doing its own thing (like Ctrl+R = reload)
    e.stopPropagation(); // stop the editor getting the key too
  }
}, true);

// ---------- buttons ----------
for (const example of EXAMPLES) {
  exampleSelect.add(new Option(example.title, example.id));
}
exampleSelect.addEventListener("change", function () { loadExample(exampleSelect.value); });
document.getElementById("run-btn").addEventListener("click", run);
document.getElementById("stop-btn").addEventListener("click", function () { stop(false); });
document.getElementById("explore-btn").addEventListener("click", startExplore);
speedSlider.addEventListener("input", function () { setVoiceSpeed(Number(speedSlider.value)); });
setVoiceSpeed(Number(speedSlider.value));
