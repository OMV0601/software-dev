import { createEditor } from "./editor.js";
import { PythonRunner } from "./python.js";
import { EXAMPLES, getExample } from "./examples.js";
import { AudioEngine } from "./audio.js";
import { buildScore } from "./sonify.js";

const audio = new AudioEngine();

const $ = (id) => document.getElementById(id);
const statusPill = $("status-pill");
const output = $("output");
const caption = $("caption");

const python = new PythonRunner({
  onStatus(state) {
    statusPill.className = "pill " + (state === "ready" ? "pill-ok" : state === "failed" ? "pill-err" : "pill-wait");
    statusPill.textContent = state === "ready" ? "Python ready" : state === "failed" ? "Python failed to load" : "Loading Python…";
  },
});

async function run() {
  audio.ensure(); // must happen inside the key press / click
  audio.stop();
  caption.textContent = "Running…";
  const result = await python.run(editor.getCode());
  output.textContent = result.output || "";
  window.__lastResult = result;
  const score = buildScore(result);
  window.__lastScore = score;
  let steps = 0;
  await audio.play(score, {
    onStep(step) {
      steps++;
      editor.highlightLine(step.line);
    },
  });
  editor.highlightLine(null);
  caption.textContent = `Finished with status: ${result.status} (${steps} sounds)`;
}

const editor = createEditor($("editor"), {
  doc: EXAMPLES[0].code,
  extraKeys: [{ key: "Mod-Enter", run: () => (run(), true) }],
});

const select = $("example-select");
for (const ex of EXAMPLES) select.add(new Option(ex.title, ex.id));
select.addEventListener("change", () => editor.setCode(getExample(select.value).code));
$("run-btn").addEventListener("click", run);
