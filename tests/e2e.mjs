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

async function runCurrent() {
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
  expect(text === "Done. countdown was called 4 times, and every call came back. Press Alt O to hear what it printed.", text);
  const levels = await page.evaluate(() => window.echocode.lastScore.steps.map((s) => s.level).join());
  expect(levels === "1,2,3,4,3,2,1,0", `staircase was ${levels}`);
});

await check("Runaway loop: names the variable that never changes (and gives up fast)", async () => {
  const started = Date.now();
  const text = await runExample(3);
  const seconds = (Date.now() - started) / 1000;
  console.log(`      (took ${seconds.toFixed(1)}s including the sounds)`);
  expect(seconds < 20, `took ${seconds}s`);
  expect(text.includes("count was 1 every single time. Is count ever changing?"), text);
});

await check("Fixed loop: three ticks, chime", async () => {
  expect((await runExample(4)) === "Done. The loop on line 2 ran 3 times. Press Alt O to hear what it printed.", await caption());
  const sounds = await page.evaluate(() => window.echocode.lastScore.steps.map((s) => s.sound).join());
  expect(sounds === "tick,tick,tick", sounds);
});

await check("Typo: did-you-mean suggestion", async () => {
  expect((await runExample(7)) === "Name error on line 3: totl is not defined. Did you mean total? Press Alt J to jump there.", await caption());
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
  await page.waitForFunction(() => window.echocode.isExploring(), null, { timeout: 15000 });
  expect((await caption()).startsWith("Explore mode. for loop, for n in range(1, 16), line 1"), await caption());
  expect((await press("ArrowRight")).startsWith("if n % 15 == 0, line 2"), await caption());
  expect((await press("ArrowDown")).startsWith("elif n % 3 == 0, line 4"), await caption());
  expect((await press("End")).startsWith("else, line 8"), await caption());
  expect((await press("ArrowDown")) === "End of for loop.", await caption());
  expect((await press("ArrowRight")) === "print, n, line 9.", await caption());
  expect((await press("Enter")) === "Editing. You're at the end of line 9. Press Enter to add a new line below it.", await caption());
  expect(await page.evaluate(() => window.echocode.getCurrentLine()) === 9, "editor cursor should be on line 9");
});

await check("Ctrl+. stops playback", async () => {
  await page.keyboard.press("Alt+1");
  await page.click(".cm-content");
  await page.keyboard.press("Control+Enter");
  await page.waitForFunction(() => window.echocode.isPlaying(), null, { timeout: 30000 });
  await page.waitForTimeout(300);
  expect((await press("Control+.")) === "Stopped.", await caption());
  expect(!(await page.evaluate(() => window.echocode.isPlaying())), "audio still playing");
});

await check("Syntax errors are announced and Explore refuses politely", async () => {
  await page.evaluate(() => window.echocode.setCode("def f(:\n    pass\n"));
  await page.click(".cm-content");
  await page.keyboard.press("Control+e");
  await page.waitForFunction(() => /Syntax error/.test(document.getElementById("caption").textContent), null, { timeout: 15000 });
  expect((await caption()).startsWith("Can't explore yet. Syntax error on line 1"), await caption());
});

await check("Arrow keys in the editor read the line out, with its indent", async () => {
  await page.keyboard.press("Alt+2");
  await page.click(".cm-content");
  await page.keyboard.press("Control+Home");
  expect((await press("ArrowDown")) === "Line 2, indent 1: if n == 0:.", await caption());
  expect((await press("ArrowDown")) === "Line 3, indent 2: return.", await caption());
  expect((await press("Alt+l")) === "Line 3, indent 2: return. You're at the start of the line.", await caption());
});

await check("Alt+J jumps to the line with the problem", async () => {
  await runExample(7);
  expect((await press("Alt+j")) === "Line 3, indent 1: total = totl + price.", await caption());
  expect(await page.evaluate(() => window.echocode.getCurrentLine()) === 3, "cursor should be on line 3");
});

await check("A misspelled keyword suggests the keyword (retur -> return)", async () => {
  await page.evaluate(() => window.echocode.setCode("def f(n):\n    if n == 0:\n        retur\n    f(n - 1)\nf(3)\n"));
  const text = await runCurrent();
  expect(text.startsWith("Name error on line 3: retur is not defined. Did you mean return?"), text);
});

await check("A long loop that DOES finish is not called infinite", async () => {
  await page.evaluate(() => window.echocode.setCode("total = 0\nfor i in range(10000):\n    total += i\nprint(total)\n"));
  const text = await runCurrent();
  expect(text.startsWith("Done. The loop on line 2 ran 10,000 times."), text);
  expect((await page.textContent("#output")).trim() === "49995000", "wrong output");
});

await check("Alt+S turns the built-in voice off and on (for screen reader users)", async () => {
  expect((await press("Alt+s")).startsWith("Built-in voice off."), await caption());
  expect((await press("Alt+s")) === "Built-in voice on.", await caption());
});

await check("Your code is still there after refreshing the page", async () => {
  await page.evaluate(() => window.echocode.setCode("print('still here')\n"));
  await page.reload();
  await page.waitForFunction(() => /ready/.test(document.getElementById("status-pill").textContent), null, { timeout: 120000 });
  const code = await page.textContent(".cm-content");
  expect(code.includes("still here"), `code after refresh: ${code}`);
});

await check("Loading an example says where the cursor is and how to run", async () => {
  const text = await press("Alt+1");
  expect(text === "Loaded Countdown (bug: never stops). It has 5 lines. You're at the end of line 1: " +
    "def countdown(n):. Use the up and down arrows to read it, or press Control Enter to run it.", text);
  expect(await page.evaluate(() => window.echocode.getCurrentLine()) === 1, "cursor should be on line 1");
});

await check("Home, End, Left and Right say where you are in the line", async () => {
  await page.keyboard.press("Alt+2");
  expect((await press("Home")) === "Start of line 1, before the code.", await caption());
  expect((await press("ArrowRight")) === "e", await caption());
  expect((await press("End")) === "End of line 1.", await caption());
  expect((await press("ArrowLeft")) === "colon", await caption());
});

await check("After you stop typing, it tells you how to run your code", async () => {
  await page.keyboard.press("Alt+2");
  await page.keyboard.press("Control+Enter");
  await page.waitForFunction(() => window.echocode.isPlaying(), null, { timeout: 30000 });
  await page.keyboard.press("Control+.");
  await page.keyboard.press("Control+End");
  await page.keyboard.type("# done");
  await page.waitForFunction(() => /press Control Enter to run your code/.test(document.getElementById("caption").textContent),
    null, { timeout: 8000 });
});

await check("Lines indented under a return get a warning and a buzz", async () => {
  await page.evaluate(() => window.echocode.setCode("def countdown(n):\n    if n == 0:\n        return\n" +
    "        print(n)\n        countdown(n - 1)\n\ncountdown(3)\n"));
  const text = await runCurrent();
  expect(text.startsWith("Your code finished, but lines 4 to 5 never run, because they come after the return on line 3."), text);
  expect(await page.evaluate(() => window.echocode.lastScore.ending) === "buzz", "should end with a buzz");
});

await check("A brand-new visitor: editor is ready and the first key gives a welcome", async () => {
  const fresh = await browser.newPage();
  fresh.on("pageerror", (e) => errors.push(e.message));
  await fresh.goto(url);
  await fresh.waitForFunction(() => /ready/.test(document.getElementById("status-pill").textContent), null, { timeout: 120000 });
  expect(await fresh.evaluate(() => document.activeElement.classList.contains("cm-content")), "editor should have focus");
  await fresh.keyboard.press("ArrowDown");
  await fresh.waitForTimeout(150);
  const text = await fresh.textContent("#caption");
  expect(text.startsWith("Welcome to EchoCode. You're in the code editor"), text);
  await fresh.close();
});

await check("No errors in the browser console", async () => {
  expect(errors.length === 0, errors.join(" | "));
});

await browser.close();
await new Promise((r) => server.httpServer.close(r));

const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
