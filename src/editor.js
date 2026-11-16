// The code editor. We use CodeMirror because it works with the keyboard
// and with screen readers out of the box.

import { basicSetup } from "codemirror";
import { EditorView, Decoration } from "@codemirror/view";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

let view = null;

// brighter colours than the default, easier to see on a dark background
const colors = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword], color: "#f472b6", fontWeight: "600" },
  { tag: [tags.function(tags.definition(tags.variableName)), tags.definition(tags.className)], color: "#22d3ee", fontWeight: "600" },
  { tag: [tags.number, tags.bool, tags.null], color: "#fbbf24" },
  { tag: [tags.string], color: "#86efac" },
  { tag: tags.comment, color: "#8b9bb0", fontStyle: "italic" },
  { tag: [tags.operator, tags.compareOperator, tags.arithmeticOperator], color: "#c4b5fd" },
  { tag: [tags.function(tags.variableName), tags.standard(tags.variableName)], color: "#93c5fd" },
]);

// ---------- highlighting the line that's running ----------
// This is the way CodeMirror wants you to add highlights: you send it an
// "effect" saying which line, and a "state field" keeps track of it.
// (It's based on the "Decorations" example in the CodeMirror docs.)
const setHighlight = StateEffect.define();

const highlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(highlights, transaction) {
    highlights = highlights.map(transaction.changes); // move it if text was typed
    for (const effect of transaction.effects) {
      if (!effect.is(setHighlight)) continue;
      const info = effect.value;
      if (!info || info.line > transaction.state.doc.lines) {
        highlights = Decoration.none; // remove the highlight
      } else {
        const lineStart = transaction.state.doc.line(info.line).from;
        const style = Decoration.line({ class: "cm-running cm-running-" + info.tone });
        highlights = Decoration.set([style.range(lineStart)]);
      }
    }
    return highlights;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const look = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--code-size)" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--accent)" },
  ".cm-gutters": { background: "var(--panel)", color: "var(--muted)", border: "none" },
  ".cm-activeLine": { background: "var(--active-line)" },
  ".cm-activeLineGutter": { background: "var(--active-line)" },
  ".cm-running-normal": { background: "var(--run-line)", boxShadow: "inset 4px 0 0 var(--accent)" },
  ".cm-running-error": { background: "var(--err-line)", boxShadow: "inset 4px 0 0 var(--err)" },
  ".cm-running-ok": { background: "var(--ok-line)", boxShadow: "inset 4px 0 0 var(--ok)" },
}, { dark: true });

export function setupEditor(parent, startingCode) {
  view = new EditorView({
    parent: parent,
    state: EditorState.create({
      doc: startingCode,
      extensions: [
        basicSetup,
        python(),
        syntaxHighlighting(colors),
        look,
        highlightField,
        EditorView.contentAttributes.of({ "aria-label": "Python code editor" }),
      ],
    }),
  });
}

export function getCode() {
  return view.state.doc.toString();
}

export function setCode(code) {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
}

export function focusEditor() {
  view.focus();
}

// put the text cursor at the end of a line
export function goToEditorLine(line) {
  const lineCount = view.state.doc.lines;
  const n = Math.min(Math.max(1, line), lineCount);
  view.dispatch({ selection: { anchor: view.state.doc.line(n).to }, scrollIntoView: true });
  view.focus();
}

export function getCurrentLine() {
  return view.state.doc.lineAt(view.state.selection.main.head).number;
}

export function getLineText(line) {
  if (line < 1 || line > view.state.doc.lines) return "";
  return view.state.doc.line(line).text;
}

// tone is "normal", "ok" or "error". Pass null to remove the highlight.
export function highlightLine(line, tone = "normal") {
  let value = null;
  if (line) value = { line: line, tone: tone };
  view.dispatch({ effects: setHighlight.of(value) });
}
