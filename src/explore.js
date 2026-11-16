// Explore mode: walk through your code by sound.
//
// Each block type has its own sound, played where that block "sits" around
// your head (deeper = further right), and the voice says a short summary.
//
//   function -> chord     loop -> drum     if / elif / else -> two-note "question"
//   return -> falling note     anything else -> bell     edge -> dull thud

import { TreeCursor, describe, describeEdge } from "./navigator.js";
import { levelToFreq, levelToPosition } from "./sonify.js";

const BRANCH_KINDS = new Set(["if", "elif", "else", "try", "except", "finally"]);

export class Explorer {
  constructor({ element, breadcrumb, editor, python, audio, speech, onSound = () => {}, onModeChange = () => {} }) {
    Object.assign(this, { element, breadcrumb, editor, python, audio, speech, onSound, onModeChange });
    this.cursor = null;
    this.active = false;
    element.addEventListener("keydown", (e) => this.onKey(e));
    element.addEventListener("blur", () => {
      // Leaving the explorer by clicking elsewhere also leaves Explore mode.
      if (this.active) this.setActive(false);
    });
  }

  async toggle() {
    if (this.active) this.leave();
    else await this.enter();
  }

  async enter() {
    this.audio.ensure();
    const parsed = await this.python.parse(this.editor.getCode());
    if (!parsed.ok) {
      const e = parsed.error;
      this.speech.say(`Can't explore yet. Syntax error on line ${e.line}: ${e.message}.`, { tone: "err" });
      this.editor.gotoLine(e.line);
      return;
    }
    this.cursor = new TreeCursor(parsed.tree);
    if (this.cursor.empty) {
      this.speech.say("The program is empty. Type some code first.");
      return;
    }
    this.cursor.goToLine(this.editor.currentLine());
    this.setActive(true);
    this.element.focus();
    this.announce("Explore mode. ");
  }

  /** Back to the editor, with the text cursor on the block you were on. */
  leave() {
    const line = this.cursor && !this.cursor.empty ? this.cursor.node.line : null;
    this.setActive(false);
    this.editor.highlightLine(null);
    if (line) this.editor.gotoLine(line);
    else this.editor.focus();
    this.speech.say(line ? `Editing, line ${line}.` : "Editing.");
  }

  setActive(on) {
    this.active = on;
    this.element.classList.toggle("active", on);
    this.onModeChange(on);
    if (!on) this.breadcrumb.replaceChildren();
  }

  onKey(e) {
    if (!this.active || e.ctrlKey || e.metaKey || e.altKey) return;
    const c = this.cursor;
    const actions = {
      ArrowDown: () => c.next(),
      ArrowUp: () => c.prev(),
      ArrowRight: () => c.enter(),
      ArrowLeft: () => c.exit(),
      Home: () => c.first(),
      End: () => c.last(),
    };
    if (actions[e.key]) {
      e.preventDefault();
      const res = actions[e.key]();
      if (res.moved) this.announce();
      else this.bump(res.edge);
    } else if (e.key === " ") {
      e.preventDefault();
      this.details();
    } else if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      this.leave();
    } else if (e.key === "h" || e.key === "H" || e.key === "?") {
      e.preventDefault();
      this.speech.say(
        "Explore mode keys. Down and up move between statements. Right goes inside a block. " +
          "Left goes back out. Home and End jump to the first or last statement. " +
          "Space reads the whole line. Enter or Escape goes back to editing on this line.",
      );
    }
  }

  /** Play the block's sound in 3D, say what it is, update the visuals. */
  announce(prefix = "") {
    const node = this.cursor.node;
    this.playNodeSound(node);
    this.speech.say(prefix + describe(node));
    this.editor.highlightLine(node.line);
    this.renderBreadcrumb();
  }

  bump(edge) {
    this.audio.thud(this.audio.now);
    this.onSound({ kind: "edge", pos: { x: 0, y: -0.3, z: -1 }, level: 0 });
    this.speech.say(describeEdge(edge, this.cursor));
  }

  details() {
    const node = this.cursor.node;
    const text = this.editor.lineText(node.line).trim();
    this.playNodeSound(node);
    const inside = node.children.length ? ` It contains lines ${node.children[0].line} to ${node.endLine}.` : "";
    this.speech.say(`Line ${node.line}, nesting level ${node.depth + 1}: \`${text}\`.${inside}`);
  }

  playNodeSound(node) {
    const a = this.audio;
    const t = a.now + 0.01;
    const level = node.depth;
    const pos = levelToPosition(level);
    const freq = levelToFreq(level + 5);
    if (node.kind === "function" || node.kind === "class") a.chord(freq, t, pos);
    else if (node.kind === "for" || node.kind === "while") a.drum(t, pos);
    else if (BRANCH_KINDS.has(node.kind)) a.branch(freq, t, pos);
    else if (node.kind === "return") a.note(freq, t, pos, { peak: 0.35, decay: 0.3 });
    else a.bell(freq, t, pos);
    this.onSound({ kind: node.kind, pos, level });
  }

  renderBreadcrumb() {
    const items = this.cursor.trail().map((n, i, all) => {
      const li = document.createElement("li");
      li.textContent = n.label;
      if (i === all.length - 1) li.className = "current";
      return li;
    });
    this.breadcrumb.replaceChildren(...items);
  }
}
