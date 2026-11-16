// Moving around the code tree with the arrow keys (Explore mode).
//
// The "cursor" remembers where you are as a path of numbers.
// Example: path [0, 1] means "the 1st block at the top, then the 2nd thing inside it".
//
//   down = next block      up = previous block
//   right = go inside      left = go back out

import { plural } from "./speakable.js";

export function makeCursor(tree) {
  let path = [];
  if (tree.children.length > 0) path = [0];
  return { tree: tree, path: path };
}

export function isEmpty(cursor) {
  return cursor.path.length === 0;
}

// follow the path down the tree to find the block we're on
export function currentNode(cursor) {
  let node = cursor.tree;
  for (const index of cursor.path) node = node.children[index];
  return node;
}

// the block that contains the current one
export function parentNode(cursor) {
  let node = cursor.tree;
  for (let i = 0; i < cursor.path.length - 1; i++) node = node.children[cursor.path[i]];
  return node;
}

// Each move returns { moved: true } or { moved: false, edge: "..." }
// so we know whether to play the block's sound or the "thud".

export function moveNext(cursor) {
  if (isEmpty(cursor)) return { moved: false, edge: "empty" };
  const last = cursor.path.length - 1;
  if (cursor.path[last] + 1 >= parentNode(cursor).children.length) return { moved: false, edge: "end" };
  cursor.path[last]++;
  return { moved: true };
}

export function movePrev(cursor) {
  if (isEmpty(cursor)) return { moved: false, edge: "empty" };
  const last = cursor.path.length - 1;
  if (cursor.path[last] === 0) return { moved: false, edge: "start" };
  cursor.path[last]--;
  return { moved: true };
}

export function moveInside(cursor) {
  if (isEmpty(cursor)) return { moved: false, edge: "empty" };
  if (currentNode(cursor).children.length === 0) return { moved: false, edge: "leaf" };
  cursor.path.push(0);
  return { moved: true };
}

export function moveOutside(cursor) {
  if (cursor.path.length <= 1) return { moved: false, edge: "top" };
  cursor.path.pop();
  return { moved: true };
}

export function moveFirst(cursor) {
  if (isEmpty(cursor)) return { moved: false, edge: "empty" };
  const last = cursor.path.length - 1;
  if (cursor.path[last] === 0) return { moved: false, edge: "start" };
  cursor.path[last] = 0;
  return { moved: true };
}

export function moveLast(cursor) {
  if (isEmpty(cursor)) return { moved: false, edge: "empty" };
  const last = cursor.path.length - 1;
  const end = parentNode(cursor).children.length - 1;
  if (cursor.path[last] === end) return { moved: false, edge: "end" };
  cursor.path[last] = end;
  return { moved: true };
}

// jump to the deepest block that contains this line (used when you start
// Explore mode, so it starts where your text cursor was)
export function goToLine(cursor, line) {
  const newPath = [];
  let node = cursor.tree;
  let found = true;
  while (found) {
    found = false;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.line <= line && line <= child.endLine) {
        newPath.push(i);
        node = child;
        found = true;
        break;
      }
    }
  }
  if (newPath.length > 0) cursor.path = newPath;
  return newPath.length > 0;
}

// every block from the top down to where we are (for the breadcrumb)
export function getTrail(cursor) {
  const trail = [];
  let node = cursor.tree;
  for (const index of cursor.path) {
    node = node.children[index];
    trail.push(node);
  }
  return trail;
}

// ---------- what the voice says ----------

// a short name for a block. `backticks` = code
export function nodeName(node) {
  const label = node.label || "";
  if (node.kind === "function") {
    // label looks like "countdown(n)"
    const name = label.split("(")[0];
    const args = label.slice(name.length + 1, -1);
    if (args === "") return `function \`${name}\`, takes nothing`;
    return `function \`${name}\`, takes \`${args}\``;
  }
  if (node.kind === "class") return `class \`${label}\``;
  if (node.kind === "for") return `for loop, \`${label}\``;
  if (node.kind === "while") return `while loop, \`${label}\``;
  if (node.kind === "if" || node.kind === "elif" || node.kind === "except") return `\`${label}\``;
  if (node.kind === "else") return "else";
  if (node.kind === "try") return "try block";
  if (node.kind === "finally") return "finally";
  if (node.kind === "print") {
    // "print(n)" -> just say what's inside
    let inside = label;
    if (inside.startsWith("print(") && inside.endsWith(")")) inside = inside.slice(6, -1);
    return `print, \`${inside}\``;
  }
  if (node.kind === "return") {
    if (label === "return") return "return";
    return `return \`${label.slice(7)}\``;
  }
  if (node.kind === "module") return "program";
  return `\`${label}\``;
}

// what you hear when you land on a block
export function describeNode(node) {
  let text = `${nodeName(node)}, line ${node.line}`;
  if (node.children && node.children.length > 0) {
    text += `, ${plural(node.children.length, "statement")} inside`;
  }
  return text + ".";
}

// what you hear when you can't go any further
export function describeEdge(edge, cursor) {
  const parent = parentNode(cursor);
  let where = "the program";
  if (parent.kind !== "module") where = nodeName(parent).split(",")[0];

  if (edge === "end") return `End of ${where}.`;
  if (edge === "start") return `Start of ${where}.`;
  if (edge === "leaf") return "Nothing inside.";
  if (edge === "top") return "Already at the top level.";
  if (edge === "empty") return "The program is empty.";
  return "";
}
