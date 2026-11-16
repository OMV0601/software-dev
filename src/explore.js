// Explore mode: walk through the code with the arrow keys and hear each block.
//
// Each type of block has its own sound, and the sound comes from where the
// block "sits" (deeper = further right). Then the voice says what it is.
//
//   function -> chord     loop -> drum     if/elif/else -> two-note "question"
//   return -> note        anything else -> bell        edge -> thud

import {
  makeCursor, isEmpty, currentNode, moveNext, movePrev, moveInside, moveOutside,
  moveFirst, moveLast, goToLine, getTrail, describeNode, describeEdge,
} from "./navigator.js";
import { levelToFreq, levelToPosition } from "./sonify.js";
import { parseCode } from "./python.js";
import { startAudio, getTime, playChord, playDrum, playBranch, playNote, playBell, playThud } from "./audio.js";
import { say } from "./speech.js";
import { getCode, goToEditorLine, focusEditor, getCurrentLine, getLineText, highlightLine } from "./editor.js";

let cursor = null;
let exploring = false;
let panel = null;        // the Explore mode box on the page
let breadcrumb = null;   // the "for > if > print" trail
let onSound = null;      // tells the visuals a sound played
let onModeChange = null; // tells main.js we switched modes

export function setupExplorer(options) {
  panel = options.panel;
  breadcrumb = options.breadcrumb;
  onSound = options.onSound;
  onModeChange = options.onModeChange;
  panel.addEventListener("keydown", handleKey);
  // if you click somewhere else, leave Explore mode
  panel.addEventListener("blur", function () {
    if (exploring) setExploring(false);
  });
}

export function isExploring() {
  return exploring;
}

export async function toggleExplore() {
  if (exploring) leaveExplore();
  else await enterExplore();
}

async function enterExplore() {
  startAudio();
  const parsed = await parseCode(getCode());
  if (!parsed.ok) {
    const err = parsed.error;
    say(`Can't explore yet. Syntax error on line ${err.line}: ${err.message}.`, "err");
    goToEditorLine(err.line);
    return;
  }
  cursor = makeCursor(parsed.tree);
  if (isEmpty(cursor)) {
    say("The program is empty. Type some code first.");
    return;
  }
  // start on whatever line the text cursor was on
  goToLine(cursor, getCurrentLine());
  setExploring(true);
  panel.focus();
  announce("Explore mode. ");
}

// go back to typing, with the text cursor on the block you were on
export function leaveExplore() {
  let line = null;
  if (cursor && !isEmpty(cursor)) line = currentNode(cursor).line;
  setExploring(false);
  highlightLine(null);
  if (line) {
    goToEditorLine(line);
    say(`Editing, line ${line}.`);
  } else {
    focusEditor();
    say("Editing.");
  }
}

export function setExploring(on) {
  exploring = on;
  if (on) panel.classList.add("active");
  else panel.classList.remove("active");
  onModeChange(on);
  if (!on) breadcrumb.innerHTML = "";
}

function handleKey(e) {
  if (!exploring || e.ctrlKey || e.metaKey || e.altKey) return;

  let result = null;
  if (e.key === "ArrowDown") result = moveNext(cursor);
  else if (e.key === "ArrowUp") result = movePrev(cursor);
  else if (e.key === "ArrowRight") result = moveInside(cursor);
  else if (e.key === "ArrowLeft") result = moveOutside(cursor);
  else if (e.key === "Home") result = moveFirst(cursor);
  else if (e.key === "End") result = moveLast(cursor);

  if (result !== null) {
    e.preventDefault();
    if (result.moved) announce("");
    else bump(result.edge);
  } else if (e.key === " ") {
    e.preventDefault();
    readWholeLine();
  } else if (e.key === "Enter" || e.key === "Escape") {
    e.preventDefault();
    leaveExplore();
  } else if (e.key === "h" || e.key === "H" || e.key === "?") {
    e.preventDefault();
    say("Explore mode keys. Down and up move between statements. Right goes inside a block. " +
        "Left goes back out. Home and End jump to the first or last statement. " +
        "Space reads the whole line. Enter or Escape goes back to editing on this line.");
  }
}

// play the block's sound, say what it is, and update the screen
function announce(start) {
  const node = currentNode(cursor);
  playBlockSound(node);
  say(start + describeNode(node));
  highlightLine(node.line);
  updateBreadcrumb();
}

// you tried to go somewhere you can't
function bump(edge) {
  playThud(getTime());
  onSound({ kind: "edge", pos: { x: 0, y: -0.3, z: -1 }, level: 0 });
  say(describeEdge(edge, cursor));
}

function readWholeLine() {
  const node = currentNode(cursor);
  const text = getLineText(node.line).trim();
  playBlockSound(node);
  let inside = "";
  if (node.children.length > 0) inside = ` It contains lines ${node.children[0].line} to ${node.endLine}.`;
  say(`Line ${node.line}, nesting level ${node.depth + 1}: \`${text}\`.${inside}`);
}

function playBlockSound(node) {
  const time = getTime() + 0.01;
  const pos = levelToPosition(node.depth);
  const freq = levelToFreq(node.depth + 5);
  const kind = node.kind;

  if (kind === "function" || kind === "class") playChord(freq, time, pos);
  else if (kind === "for" || kind === "while") playDrum(time, pos);
  else if (["if", "elif", "else", "try", "except", "finally"].includes(kind)) playBranch(freq, time, pos);
  else if (kind === "return") playNote(freq, time, pos, 0.35, 0.3);
  else playBell(freq, time, pos);

  let label = node.label;
  if (label.length > 22) label = label.slice(0, 21) + "…";
  onSound({ kind: kind, pos: pos, level: node.depth, label: label });
}

function updateBreadcrumb() {
  breadcrumb.innerHTML = "";
  const trail = getTrail(cursor);
  for (let i = 0; i < trail.length; i++) {
    const item = document.createElement("li");
    item.textContent = trail[i].label;
    if (i === trail.length - 1) item.className = "current";
    breadcrumb.appendChild(item);
  }
}
