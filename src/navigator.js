// Tree cursor: moves around the code tree from parse_tree().
//
//   ↓ next statement   ↑ previous statement
//   → go inside a block (function, loop, if…)   ← go back out
//
// Pure logic, no sound or DOM, so it is easy to test. The cursor is a "path":
// a list of child indexes from the root, e.g. [0, 1] = 2nd statement inside
// the 1st top-level block.

import { plural } from "./speakable.js";

export class TreeCursor {
  constructor(root) {
    this.root = root;
    this.path = root.children.length ? [0] : [];
  }

  get node() {
    let n = this.root;
    for (const i of this.path) n = n.children[i];
    return n;
  }

  get parent() {
    let n = this.root;
    for (const i of this.path.slice(0, -1)) n = n.children[i];
    return n;
  }

  get empty() {
    return this.path.length === 0;
  }

  /** Each move returns { moved, edge? } so the caller knows what to play. */
  next() {
    if (this.empty) return { moved: false, edge: "empty" };
    const last = this.path.length - 1;
    if (this.path[last] + 1 >= this.parent.children.length) return { moved: false, edge: "end" };
    this.path[last]++;
    return { moved: true };
  }

  prev() {
    if (this.empty) return { moved: false, edge: "empty" };
    const last = this.path.length - 1;
    if (this.path[last] === 0) return { moved: false, edge: "start" };
    this.path[last]--;
    return { moved: true };
  }

  enter() {
    if (this.empty) return { moved: false, edge: "empty" };
    if (!this.node.children.length) return { moved: false, edge: "leaf" };
    this.path.push(0);
    return { moved: true };
  }

  exit() {
    if (this.path.length <= 1) return { moved: false, edge: "top" };
    this.path.pop();
    return { moved: true };
  }

  first() {
    if (this.empty) return { moved: false, edge: "empty" };
    const moved = this.path[this.path.length - 1] !== 0;
    this.path[this.path.length - 1] = 0;
    return { moved, edge: moved ? undefined : "start" };
  }

  last() {
    if (this.empty) return { moved: false, edge: "empty" };
    const end = this.parent.children.length - 1;
    const moved = this.path[this.path.length - 1] !== end;
    this.path[this.path.length - 1] = end;
    return { moved, edge: moved ? undefined : "end" };
  }

  /** Jump to the deepest block that contains a line (e.g. the editor's cursor). */
  goToLine(line) {
    const path = [];
    let n = this.root;
    for (;;) {
      const i = n.children.findIndex((c) => c.line <= line && line <= c.endLine);
      if (i === -1) break;
      path.push(i);
      n = n.children[i];
    }
    if (path.length) this.path = path;
    return path.length > 0;
  }

  /** Nodes from the top level down to the current one. */
  trail() {
    const out = [];
    let n = this.root;
    for (const i of this.path) {
      n = n.children[i];
      out.push(n);
    }
    return out;
  }
}

// ---------------------------------------------------------------- describing

/** Short spoken name for a block, with `code` in backticks. */
export function nodeName(node) {
  const label = node.label || "";
  switch (node.kind) {
    case "function": {
      const m = label.match(/^(\w+)\((.*)\)$/);
      if (!m) return `function \`${label}\``;
      return m[2] ? `function \`${m[1]}\`, takes \`${m[2]}\`` : `function \`${m[1]}\`, takes nothing`;
    }
    case "class": return `class \`${label}\``;
    case "for": return `for loop, \`${label}\``;
    case "while": return `while loop, \`${label}\``;
    case "if":
    case "elif": return `\`${label}\``;
    case "else": return "else";
    case "try": return "try block";
    case "except": return `\`${label}\``;
    case "finally": return "finally";
    case "print": return `print, \`${label.replace(/^print\((.*)\)$/, "$1")}\``;
    case "return": return label === "return" ? "return" : `return \`${label.replace(/^return /, "")}\``;
    case "module": return "program";
    default: return `\`${label}\``;
  }
}

/** What the voice says when you land on a block. */
export function describe(node) {
  let text = `${nodeName(node)}, line ${node.line}`;
  if (node.children && node.children.length) {
    text += `, ${plural(node.children.length, "statement")} inside`;
  }
  return text + ".";
}

/** What the voice says when you bump into an edge. */
export function describeEdge(edge, cursor) {
  const parent = cursor.parent;
  const where = parent.kind === "module" ? "the program" : nodeName(parent).split(",")[0];
  switch (edge) {
    case "end": return `End of ${where}.`;
    case "start": return `Start of ${where}.`;
    case "leaf": return "Nothing inside.";
    case "top": return "Already at the top level.";
    case "empty": return "The program is empty.";
    default: return "";
  }
}
