# ECHO CODE (software dev TSA)

# 🎧 EchoCode

**Hear the shape of your code. Hear it run.**

EchoCode is a browser-based coding environment for blind and visually impaired students learning to program. It turns code structure into **3D spatial sound** and turns running code into **music**, so students can understand and debug programs without seeing them.

---

## 📌 The Problem

Learning to code is heavily visual: indentation, nested blocks, syntax colours, flowcharts and debuggers.

Blind and visually impaired students usually use **screen readers**, which read code one character or one line at a time:

> "d, e, f, space, c, o, u, n, t, d, o, w, n, left paren, n, right paren, colon…"

This makes it very hard to:
- understand **structure** (what is inside what)
- follow **what happens when the code runs**
- find bugs like **infinite loops** or **recursion that never stops**

---

## 💡 Our Solution

EchoCode gives students two new ways to understand code:

### 1. 🎵 Hear It Run (execution sonification)
Press **Run** and every step of the program plays a sound.

| Code behaviour | What you hear |
|---|---|
| Function calls itself (recursion) | Notes go **up** with each call and **down** with each return |
| Loop goes round once | A **tick** (like a drum beat) |
| Program finishes correctly | ✨ A **chime** |
| Something goes wrong | 🔴 A low **buzz** + a spoken explanation |

### 2. 🧭 Walk Through Code by Sound (spatial navigation)
Instead of reading character by character, students move through **blocks** of code with arrow keys.

| Key | Action |
|---|---|
| ↓ / ↑ | Next / previous statement |
| → | Go **inside** a block (function, loop, if) |
| ← | Go back **out** of a block |
| Ctrl + Enter | Run the code |
| Esc | Stop running / stop speech |

Each block type has its own sound, and **deeper blocks sound further to the right** in your headphones. A voice gives a short summary like *"for loop, line 3, 2 statements inside."*

---

## 🧪 Examples

### Example 1: Recursion that never stops

```python
def countdown(n):
    print(n)
    countdown(n - 1)   # bug: nothing tells it to stop

countdown(3)
```

**What you hear:**
> 🎵 do… re… mi… so… la… higher… higher… higher… **BZZZT**

**Voice:** *"Recursion on line 3 went 1000 calls deep and never came back. No stop condition?"*

**Fixed:**
```python
def countdown(n):
    if n == 0:
        return
    print(n)
    countdown(n - 1)

countdown(3)
```

**What you hear:**
> 🎵 do… re… mi… **so**… mi… re… do… ✨ chime

**Voice:** *"Done. 4 calls, all returned."*

> Think of it like stairs: each call is a step **up**, each return is a step **down**. A bug sounds like stairs that never end.

---

### Example 2: A loop that never ends

```python
count = 1
while count <= 3:
    print(count)
    # bug: forgot count = count + 1
```

**What you hear:**
> tick tick tick tick tick tick tick… **BZZZT**

**Voice:** *"The loop on line 2 ran 1000 times and never stopped. Is `count` ever changing?"*

**Fixed:**
```python
count = 1
while count <= 3:
    print(count)
    count = count + 1
```

**What you hear:**
> tick… tick… tick… ✨ chime

**Voice:** *"Done. The loop ran 3 times."*

---

### Example 3: Exploring code with arrow keys

Using the buggy `countdown` code from Example 1:

| Key pressed | Sound | Voice | Position in headphones |
|---|---|---|---|
| ↓ | 🎹 chord | "function countdown" | centre |
| → | 🔔 bell | "print n" | slightly right |
| ↓ | 🔔 bell | "call countdown, n minus 1" | slightly right |
| ↓ | — | "end of function" | — |

There is no `if` sound anywhere, so the student can tell there is **no stop condition**.

---

## 🛠️ Tech Stack

| Part | Technology | Why |
|---|---|---|
| Code editor | **CodeMirror 6** | Accessible, keyboard-friendly editor |
| Running Python | **Pyodide** (in a **Web Worker**) | Real Python in the browser, no server needed |
| Reading code structure | Python **`ast`** module | Turns code into a tree of blocks |
| Tracking execution | Python **`sys.settrace`** | Reports every line and function call as it runs |
| 3D sound | **Web Audio API** (`PannerNode`, HRTF) | Places sounds around the listener's head |
| Voice | **Web Speech API** (`speechSynthesis`) | Speaks summaries and errors |
| Screen reader support | **ARIA live regions** | Works alongside existing screen readers |
| Build tool | **Vite** | Fast local development |

**No AI is used to decide if code is right or wrong.** Bug detection is done by plain code, so it is fast, predictable and cannot make things up.

---

## 🏗️ Architecture

```
┌──────────────── Browser (main thread) ────────────────┐
│  Editor (CodeMirror)    ← student types code          │
│  Keyboard controller    ← every action is a key       │
│  Tree navigator         ← arrow keys walk the code    │
│  Audio engine           ← 3D notes (Web Audio)        │
│  Speech                 ← voice (Web Speech API)      │
│  Visual overlay         ← shows sounds for sighted    │
│                           viewers (demo / teachers)   │
└───────────────┬───────────────────────────────────────┘
                │  messages (JSON)
┌───────────────▼──────── Web Worker ───────────────────┐
│  Pyodide (Python in the browser)                      │
│   • parse_tree(code) → code structure as JSON         │
│   • trace_run(code)  → list of execution events       │
└───────────────────────────────────────────────────────┘
```

**Why a Web Worker?** If the student's code has an infinite loop, it would freeze the page. Running it in a worker keeps the page responsive, and we can stop it at any time.

### How it works, step by step
1. The student writes Python in the editor.
2. **`parse_tree`** uses Python's `ast` module to turn the code into a tree:
   ```json
   { "type": "FunctionDef", "label": "countdown", "line": 1, "depth": 0,
     "children": [
       { "type": "Expr", "label": "print(n)", "line": 2, "depth": 1 },
       { "type": "Expr", "label": "countdown(n - 1)", "line": 3, "depth": 1 }
     ] }
   ```
3. On **Run**, **`trace_run`** uses `sys.settrace` to record every step:
   ```json
   [ {"e": "call", "line": 1, "depth": 1},
     {"e": "line", "line": 2, "depth": 1},
     {"e": "call", "line": 1, "depth": 2} ]
   ```
   - A safety limit (around 3000 events) catches infinite loops.
   - Python's own `RecursionError` catches infinite recursion.
4. The **analyzer** reads the events and names the problem in plain English.
5. The **audio engine** turns each event into a note, tick or chime, timed on the audio clock so the rhythm stays even.
6. The **speech** module reads out the result.

### Sound mapping

| Code thing | Sound |
|---|---|
| Call depth | **Pitch** (deeper = higher, on a pentatonic scale so it always sounds musical) |
| Loop iteration | Short drum tick |
| Function call / return | Rising / falling blip |
| Nesting depth | **Position**: further right in the headphones |
| Error | Low buzz |
| Success | Chime |

---

## 📁 Project Structure

```
echocode/
├─ index.html
├─ src/
│  ├─ main.js          # wiring + keyboard shortcuts
│  ├─ editor.js        # CodeMirror setup
│  ├─ worker.js        # loads Pyodide, runs helpers.py
│  ├─ helpers.py       # parse_tree + trace_run
│  ├─ analyze.js       # turns events into a plain-English diagnosis
│  ├─ audio.js         # Web Audio engine (3D sound)
│  ├─ navigator.js     # arrow-key tree walking
│  ├─ speech.js        # voice + ARIA live region
│  └─ overlay.js       # visual view of the sound for sighted viewers
└─ examples/           # sample programs (buggy + fixed)
```

---

## 🚀 Getting Started

```bash
git clone <your-repo-url>
cd echocode
npm install
npm run dev
```

Then open the local URL in **Chrome** and **put on headphones** 🎧 (needed for the 3D sound).

---

## 🗺️ Roadmap / Next Steps

- [ ] Haptic feedback through game controllers (Gamepad API vibration)
- [ ] Support for more languages (JavaScript, Java)
- [ ] Sounds for data structures (lists, dictionaries, trees)
- [ ] Teacher mode: share examples and see where students get stuck
- [ ] User testing with more blind and low-vision students

---

## ⚠️ Current Limitations

- Supports **Python only** for now.
- Best experienced with **headphones**; 3D sound does not work well on speakers.
- Built and tested as a prototype; it has not yet been tested at scale with blind and low-vision users.

---

## 👥 Team

- Name: role
- Name: role
