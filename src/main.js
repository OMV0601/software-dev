// EchoCode main file: connects the editor, Python, sound, voice and visuals.

import { setupEditor, getCode, setCode, highlightLine, getCurrentLine, getLineText, goToEditorLine, getEditorElement } from "./editor.js";
import { startPython, isPythonReady, runCode } from "./python.js";
import { EXAMPLES, getExample } from "./examples.js";
import { startAudio, playScore, stopSound, isPlaying } from "./audio.js";
import { buildScore } from "./sonify.js";
import { analyze } from "./analyze.js";
import { setupSpeech, say, repeatLast, stopTalking, setVoiceSpeed, setVoiceOn, isVoiceOn } from "./speech.js";
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
let lastProblemLine = null; // so Alt+J can jump to the line with the problem

// ---------- saving settings + code ----------
// localStorage keeps things after you close the page. It can fail (like in
// private browsing), so every use is wrapped in try/catch.
function loadSaved(name, fallback) {
  try {
    const value = localStorage.getItem("echocode-" + name);
    if (value === null) return fallback;
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function save(name, value) {
  try {
    localStorage.setItem("echocode-" + name, JSON.stringify(value));
  } catch (err) {
    // not a big deal, it just won't be remembered
  }
}

let readLinesAloud = loadSaved("readLines", true);

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
// start with the code from last time, so refreshing the page doesn't lose your work
setupEditor(document.getElementById("editor"), loadSaved("code", EXAMPLES[0].code), function (code) {
  save("code", code);
});
setVoiceOn(loadSaved("voiceOn", true));

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
  lastProblemLine = analysis.line;
  // tell them what they can do next
  let message = analysis.text;
  if (!ok && analysis.line) message += " Press Alt J to jump there.";
  if (ok && result.output) message += " Press Alt O to hear what it printed.";
  say(message, analysis.tone);
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

// "Line 3, indent 2: return" - indent matters a lot in Python
function describeLine(lineNumber) {
  const text = getLineText(lineNumber);
  let spaces = 0;
  for (const ch of text) {
    if (ch === " ") spaces += 1;
    else if (ch === "\t") spaces += 4;
    else break;
  }
  const indent = Math.floor(spaces / 4);
  let result = "Line " + lineNumber;
  if (text.trim() === "") result += ", blank";
  if (indent > 0) result += ", indent " + indent;
  if (text.trim() === "") return result + ".";
  return result + ": `" + text.trim() + "`.";
}

// Alt+L: "where am I?"
function readCurrentLine() {
  say(describeLine(getCurrentLine()));
}

// Alt+J: jump to the line that had the problem in the last run
function jumpToProblem() {
  if (!lastProblemLine) {
    say("No problem to jump to. Run your code first with Control Enter.");
    return;
  }
  goToEditorLine(lastProblemLine);
  say(describeLine(lastProblemLine));
}

// read the line out loud when you move up/down in the editor.
// People with their own screen reader can turn this off (Alt+A), because their
// screen reader already does it.
getEditorElement().addEventListener("keydown", function (e) {
  if (!readLinesAloud || e.altKey) return;
  // if the autocomplete popup is open, the arrows pick a suggestion instead of moving lines
  if (document.querySelector(".cm-tooltip-autocomplete")) return;
  const moveKeys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Enter"];
  const ctrlMove = (e.ctrlKey || e.metaKey) && (e.key === "Home" || e.key === "End");
  if (moveKeys.includes(e.key) || ctrlMove) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") return; // that's Run, not a new line
    // wait until the editor has actually moved the cursor, then read
    setTimeout(readCurrentLine, 0);
  }
});

function toggleLineReading() {
  readLinesAloud = !readLinesAloud;
  save("readLines", readLinesAloud);
  say(readLinesAloud ? "Reading lines aloud is on." : "Reading lines aloud is off.");
}

function toggleVoice() {
  const on = !isVoiceOn();
  save("voiceOn", on);
  if (on) {
    setVoiceOn(true);
    say("Built-in voice on.");
  } else {
    say("Built-in voice off. Your screen reader will still read every message.");
    setVoiceOn(false);
  }
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
  "Alt L says which line you're on. Alt J jumps to the problem. Alt O reads the output. " +
  "Control R repeats the last message. Alt 1 to 7 loads an example. " +
  "Alt A turns line reading on or off, and Alt S turns this voice off if you use your own screen reader. " +
  "Tab indents. To leave the editor, press Escape, then Tab. Alt V hides the visuals.";

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
  else if (e.altKey && e.code === "KeyL") readCurrentLine();
  else if (e.altKey && e.code === "KeyJ") jumpToProblem();
  else if (e.altKey && e.code === "KeyA") toggleLineReading();
  else if (e.altKey && e.code === "KeyS") toggleVoice();
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
speedSlider.value = loadSaved("speed", 1.3);
speedSlider.addEventListener("input", function () {
  setVoiceSpeed(Number(speedSlider.value));
  save("speed", Number(speedSlider.value));
});
setVoiceSpeed(Number(speedSlider.value));

// say hello the first time someone clicks or tabs into the editor
let welcomed = false;
getEditorElement().addEventListener("focus", function () {
  if (welcomed) return;
  welcomed = true;
  say("EchoCode. Press F1 for help, or Control Enter to run your code.");
});
