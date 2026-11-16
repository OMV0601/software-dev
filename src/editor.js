// CodeMirror 6 editor setup.
//
// CodeMirror is used because it is keyboard-first and works with screen
// readers (it uses a real contenteditable element with ARIA attributes).
// Also exposes a "running line" highlight used while code is playing.

import { basicSetup } from "codemirror";
import { EditorView, Decoration, keymap } from "@codemirror/view";
import { EditorState, StateEffect, StateField, Prec } from "@codemirror/state";
import { python } from "@codemirror/lang-python";

const setRunningLine = StateEffect.define();

const runningLineField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setRunningLine)) continue;
      const { line, tone } = effect.value || {};
      if (!line || line > tr.state.doc.lines) {
        deco = Decoration.none;
      } else {
        const from = tr.state.doc.line(line).from;
        deco = Decoration.set([
          Decoration.line({ class: `cm-running cm-running-${tone || "normal"}` }).range(from),
        ]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "var(--code-size)" },
    ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6" },
    ".cm-content": { caretColor: "var(--accent)" },
    ".cm-gutters": { background: "var(--panel)", color: "var(--muted)", border: "none" },
    ".cm-activeLine": { background: "var(--active-line)" },
    ".cm-activeLineGutter": { background: "var(--active-line)" },
    ".cm-running-normal": { background: "var(--run-line)", boxShadow: "inset 4px 0 0 var(--accent)" },
    ".cm-running-error": { background: "var(--err-line)", boxShadow: "inset 4px 0 0 var(--err)" },
    ".cm-running-ok": { background: "var(--ok-line)", boxShadow: "inset 4px 0 0 var(--ok)" },
  },
  { dark: true },
);

export function createEditor(parent, { doc = "", onChange = () => {}, extraKeys = [] } = {}) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        // Our shortcuts win over CodeMirror's defaults.
        Prec.highest(keymap.of(extraKeys)),
        basicSetup,
        python(),
        theme,
        runningLineField,
        EditorView.contentAttributes.of({ "aria-label": "Python code editor" }),
        EditorView.updateListener.of((u) => u.docChanged && onChange(u.state.doc.toString())),
      ],
    }),
  });

  return {
    view,
    getCode: () => view.state.doc.toString(),
    setCode(code) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    },
    focus: () => view.focus(),
    // Put the text cursor at the end of a line (used when leaving Explore mode).
    gotoLine(line) {
      const n = Math.min(Math.max(1, line), view.state.doc.lines);
      const pos = view.state.doc.line(n).to;
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    },
    currentLine: () => view.state.doc.lineAt(view.state.selection.main.head).number,
    lineText(line) {
      if (line < 1 || line > view.state.doc.lines) return "";
      return view.state.doc.line(line).text;
    },
    highlightLine(line, tone = "normal") {
      view.dispatch({ effects: setRunningLine.of(line ? { line, tone } : null) });
    },
  };
}
