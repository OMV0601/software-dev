// End-to-end test: builds nothing itself; serves ./dist with Vite's preview
// server and drives the real app in Chromium with real key presses.
//
//   npm run test:e2e        (builds first, then runs this)
//
// Needs Playwright with Chromium. If it is missing:
//   npm i -D playwright && npx playwright install chromium

import { createRequire } from "node:module";
import { preview } from "vite";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push([false, name]);
    console.log(`  ✗ ${name}\n      ${String(err.message).split("\n")[0]}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const caption = () => page.textContent("#caption");

async function runExample(n) {
  await page.keyboard.press(`Alt+${n}`);
  const before = await page.evaluate(() => window.echocode.lastFinishedAt || 0);
  await page.click(".cm-content");
  await page.keyboard.press("Control+Enter");
  await page.waitForFunction((b) => (window.echocode.lastFinishedAt || 0) > b, before, { timeout: 45000 });
  return caption();
}

async function press(key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
  return caption();
}

console.log(`EchoCode end-to-end test on ${url}`);
await page.goto(url);

await check("Python loads in the browser (offline, from /pyodide)", async () => {
  await page.waitForFunction(() => /ready|failed/.test(document.getElementById("status-pill").textContent), null, { timeout: 120000 });
  expect((await page.textContent("#status-pill")) === "Python ready", "status pill is not 'Python ready'");
});

await check("Runaway recursion: climbs, buzzes, explains the missing if", async () => {
  const text = await runExample(1);
  expect(/Recursion on line 3 went \d+ calls deep and never came back/.test(text), text);
  expect(text.includes("countdown has no if"), text);
  const score = await page.evaluate(() => window.echocode.lastScore);
  expect(score.ending === "buzz" && score.truncated, "expected a truncated score ending in a buzz");
  const levels = score.steps.slice(0, 5).map((s) => s.level);
  expect(levels.join() === "1,2,3,4,5", `pitch should climb, got ${levels}`);
  expect(await page.$(".cm-running-error"), "line 3 should be highlighted as an error");
});

await check("Fixed recursion: up then back down, chime", async () => {
  const text = await runExample(2);
  expect(text === "Done. countdown was called 4 times, and every call came back.", text);
  const levels = await page.evaluate(() => window.echocode.lastScore.steps.map((s) => s.level).join());
  expect(levels === "1,2,3,4,3,2,1,0", `staircase was ${levels}`);
});

await check("Runaway loop: names the variable that never changes", async () => {
  const text = await runExample(3);
  expect(text.includes("count was 1 every single time. Is count ever changing?"), text);
});

await check("Fixed loop: three ticks, chime", async () => {
  expect((await runExample(4)) === "Done. The loop on line 2 ran 3 times.", await caption());
  const sounds = await page.evaluate(() => window.echocode.lastScore.steps.map((s) => s.sound).join());
  expect(sounds === "tick,tick,tick", sounds);
});

await check("Typo: did-you-mean suggestion", async () => {
  expect((await runExample(7)) === "Name error on line 3: totl is not defined. Did you mean total?", await caption());
});

await check("Alt+O reads the output aloud", async () => {
  await runExample(2);
  expect((await press("Alt+o")) === "Output, 3 lines: 3, 2, 1.", await caption());
});

await check("Explore mode: arrow keys walk the code by blocks", async () => {
  await page.keyboard.press("Alt+5");
  await page.click(".cm-content");
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+e");
  await page.waitForFunction(() => window.echocode.explorer.active, null, { timeout: 15000 });
  expect((await caption()).startsWith("Explore mode. for loop, for n in range(1, 16), line 1"), await caption());
  expect((await press("ArrowRight")).startsWith("if n % 15 == 0, line 2"), await caption());
  expect((await press("ArrowDown")).startsWith("elif n % 3 == 0, line 4"), await caption());
  expect((await press("End")).startsWith("else, line 8"), await caption());
  expect((await press("ArrowDown")) === "End of for loop.", await caption());
  expect((await press("ArrowRight")) === "print, n, line 9.", await caption());
  expect((await press("Enter")) === "Editing, line 9.", await caption());
  expect(await page.evaluate(() => window.echocode.editor.currentLine()) === 9, "editor cursor should be on line 9");
});

await check("Ctrl+. stops playback", async () => {
  await page.keyboard.press("Alt+1");
  await page.click(".cm-content");
  await page.keyboard.press("Control+Enter");
  await page.waitForFunction(() => window.echocode.audio.playing, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  expect((await press("Control+.")) === "Stopped.", await caption());
  expect(!(await page.evaluate(() => window.echocode.audio.playing)), "audio still playing");
});

await check("Syntax errors are announced and Explore refuses politely", async () => {
  await page.evaluate(() => window.echocode.editor.setCode("def f(:\n    pass\n"));
  await page.click(".cm-content");
  await page.keyboard.press("Control+e");
  await page.waitForFunction(() => /Syntax error/.test(document.getElementById("caption").textContent), null, { timeout: 15000 });
  expect((await caption()).startsWith("Can't explore yet. Syntax error on line 1"), await caption());
});

await check("No errors in the browser console", async () => {
  expect(errors.length === 0, errors.join(" | "));
});

await browser.close();
await new Promise((r) => server.httpServer.close(r));

const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
