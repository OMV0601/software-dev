# 🎧 EchoCode

**Hear the shape of your code. Hear it run.**

EchoCode is a Python editor for blind and visually impaired students learning to program. It turns **running code into music** and lets you **walk through code by sound**, so you can understand and debug a program without seeing it.

Everything runs in the browser. Python itself runs locally (no server, no account, works offline once loaded), and **no AI decides whether your code is right**. Every bug explanation comes from plain, deterministic, tested code.

---

## The problem

Learning to code is heavily visual: indentation, nested blocks, colours, debuggers. Screen readers read code one character or one line at a time:

> "d, e, f, space, c, o, u, n, t, d, o, w, n, left paren, n, right paren, colon…"

That makes it hard to tell **what is inside what**, to follow **what happens when the code runs**, and to find bugs like **loops that never end** or **recursion that never stops**.

## What EchoCode does

### 1. 🎵 Hear it run
Press **Ctrl + Enter**. Every step of the program becomes a sound.

| What the code does | What you hear |
|---|---|
| A function calls itself | Each call is a note one step **higher** |
| A call returns | A note one step **lower** |
| A loop goes round | A **tick** |
| The program finishes | ✨ A **chime**, then a spoken summary |
| Something goes wrong | A low **buzz**, then a spoken explanation |

Deeper code is also placed **further to the right** in your headphones (3D audio).

### 2. 🧭 Walk through code by sound
Press **Ctrl + E** for Explore mode. Move through **blocks**, not characters.

| Key | Action |
|---|---|
| ↓ / ↑ | Next / previous statement |
| → / ← | Go inside a block / back out |
| Home / End | First / last statement at this level |
| Space | Read the whole line |
| Enter or Esc | Back to editing, on this line |

Each block type has its own sound: function = chord, loop = drum, if/elif/else = two-note "question", other statements = bell, hitting an edge = thud.

### 3. 🗣️ Plain-English explanations
After each run, EchoCode says what happened, for example:

- *"Recursion on line 3 went 395 calls deep and never came back. `n` went 3, 2, 1, 0, -1, and kept going. `countdown` has no `if`, so nothing tells it to stop."*
- *"The while loop on line 2 ran 1,000 times and never stopped. `count` was 1 every single time. Is `count` ever changing?"*
- *"Name error on line 3: `totl` is not defined. Did you mean `total`?"*
- *"Done. `countdown` was called 4 times, and every call came back."*

Code in messages is read the way a teacher would say it: `count = count + 1` → "count becomes count plus 1".

### 4. 👀 Visuals for sighted viewers
Teachers, classmates and judges can **see** what the student hears: a top-down view of the listener's head showing where each sound sits, a live **pitch graph** (working recursion draws a mountain; runaway recursion climbs and never comes down), the running line highlighted, and captions of everything spoken.

---

## Examples

### Recursion that never stops
```python
def countdown(n):
    print(n)
    countdown(n - 1)   # nothing tells it to stop

countdown(3)
```
🎵 *do… re… mi… so… higher… higher… higher…* **BZZZT**

Add `if n == 0: return` and run it again:
🎵 *do… re… mi… **so**… mi… re… do…* ✨ **chime**

> Think of it like stairs: each call is a step **up**, each return a step **down**. A bug sounds like stairs that never end.

### A loop that never ends
```python
count = 1
while count <= 3:
    print(count)       # forgot: count = count + 1
```
*tick tick tick tick tick…* **BZZZT**, then *"`count` was 1 every single time. Is `count` ever changing?"*

With the fix: *tick… tick… tick…* ✨ **chime**, then *"Done. The loop on line 2 ran 3 times."*

Seven examples are built in (**Alt + 1** to **Alt + 7**): each bug comes with its fixed twin.

---

## All keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl + Enter | Run and hear the code |
| Ctrl + . | Stop |
| Ctrl + E | Explore mode on / off |
| Ctrl + R | Repeat the last message |
| Alt + O | Read the program's output aloud |
| Alt + 1 … 7 | Load an example |
| Alt + V | Hide / show the visuals |
| F1 | Spoken help |

(On a Mac, Cmd works in place of Ctrl.) Everything spoken is also sent to an ARIA live region, so it works alongside screen readers such as NVDA, JAWS and VoiceOver. Voice speed is adjustable.

---

## How it works

```
┌─────────────── Browser (main thread) ───────────────┐
│ Editor (CodeMirror 6)       you type code           │
│ Explorer + tree cursor      arrow keys walk blocks  │
│ Analyzer                    plain-English diagnosis │
│ Audio engine (Web Audio)    3D notes, ticks, chime  │
│ Speech (Web Speech API)     voice + ARIA live region│
│ Overlay (canvas)            visuals for sighted     │
└──────────────┬──────────────────────────────────────┘
               │ JSON messages
┌──────────────▼─────────── Web Worker ───────────────┐
│ Pyodide: real CPython compiled to WebAssembly       │
│   parse_tree(code) → blocks, using Python's `ast`   │
│   trace_run(code)  → every step, using sys.settrace │
└─────────────────────────────────────────────────────┘
```

1. **`parse_tree`** uses Python's own `ast` module to turn code into a tree of blocks (if/elif/else are kept side by side, as they look).
2. **`trace_run`** runs the code with `sys.settrace`, recording each call, return, loop round and print, with the call depth and argument values.
   - A **step budget** stops infinite loops (it can't be swallowed by `except Exception`).
   - A **recursion limit** catches runaway recursion.
   - The worker runs on its own thread with a **hard timeout**, so the page never freezes.
3. **`analyze.js`** reads the trace and explains it: which line, which values, which variable never changed, whether a stop condition exists.
4. **`sonify.js`** turns the trace into a score: call depth → pitch on a pentatonic scale (so it always sounds musical), loop rounds → ticks; long runs speed up so runaway code sounds like it's spiralling away.
5. **`audio.js`** synthesises every sound with oscillators (no audio files) and places it in 3D with an HRTF `PannerNode`, scheduled on the audio clock so the rhythm is exact.

## Tech stack

| Part | Technology |
|---|---|
| Editor | CodeMirror 6 (keyboard-first, screen-reader friendly) |
| Python | Pyodide 0.27 (CPython 3.12 in WebAssembly), in a Web Worker, served locally |
| Structure | Python `ast` |
| Execution tracing | Python `sys.settrace` |
| 3D sound | Web Audio API (`PannerNode`, HRTF) |
| Voice | Web Speech API + ARIA live region |
| Build / tests | Vite, Vitest, Python `unittest`, Playwright |

## Project structure

```
index.html
src/
  main.js        wiring, shortcuts, run/stop
  editor.js      CodeMirror setup + running-line highlight
  python.js      worker client with timeout + restart
  worker.js      loads Pyodide, calls helpers.py
  helpers.py     parse_tree + trace_run (the Python side)
  analyze.js     trace → plain-English explanation
  sonify.js      trace → score (pitch, ticks, timing)
  audio.js       Web Audio engine (3D, all sounds synthesised)
  navigator.js   tree cursor + spoken block descriptions
  explore.js     Explore mode (keys, sounds, breadcrumb)
  speech.js      voice + live region
  speakable.js   reads code aloud naturally
  overlay.js     head view + pitch graph
  examples.js    built-in example programs
tests/           unit tests (JS + Python) and an end-to-end browser test
scripts/         copies the Pyodide runtime into public/
```

## Run it locally

Requires Node.js 18+ (and Python 3 for the Python tests).

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL in **Chrome or Edge** and **put on headphones** 🎧. The first load downloads Python (about 10 MB) from your own server; after that it's cached.

## Tests

```bash
npm test
```
Runs the JavaScript unit tests (Vitest) and the Python unit tests. The JS tests run the **real** Python helpers to get genuine traces.

```bash
npm run test:e2e
```
Builds the app and drives it in Chromium with real key presses (needs Playwright: `npm i -D playwright && npx playwright install chromium`).

## Deploy

```bash
npm run build
```
Upload the `dist/` folder to any static host (GitHub Pages, Netlify, Vercel). No server code is needed.

---

## Limitations (honest list)

- **Python only**, and `input()` is not supported yet.
- 3D sound needs **headphones**; on speakers you still hear pitch and rhythm, but not position.
- Long runs are summarised: only the first 90 sounds play, then the ending.
- Speech uses the voices installed on your computer, so it sounds different on each system.
- This is a prototype. It has not yet been tested at scale with blind and low-vision students.

## Next steps

- [ ] Testing sessions with blind and low-vision students and teachers of the visually impaired
- [ ] Sounds for data structures (lists, dictionaries)
- [ ] Step-by-step playback (pause, step forward, hear variable values)
- [ ] Haptic feedback through game controllers (Gamepad API vibration)
- [ ] More languages (JavaScript, Java)
- [ ] Teacher mode: share exercises and see where students get stuck
