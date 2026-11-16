// Turns the list of steps Python took into a "score": which sound to play
// and when. No actual sound in here, which makes it easy to test.
//
//   function call   -> a note one step HIGHER (walking up the stairs)
//   return          -> a note one step LOWER  (walking back down)
//   loop goes round -> a tick
//   the end         -> chime if it worked, buzz if something went wrong

// The pentatonic scale only has 5 notes per octave, and any of them sound
// good together, so it never sounds out of tune.
const PENTATONIC = [0, 2, 4, 7, 9]; // semitones above the bottom note
const LOWEST_NOTE = 196;            // G3, in Hz
const HIGHEST_LEVEL = 24;           // after this it stays at the top note

export const MAX_SOUNDS = 90; // long runs only play the first 90 sounds

// level 0, 1, 2... -> frequency in Hz
export function levelToFreq(level) {
  let l = Math.round(level);
  if (l < 0) l = 0;
  if (l > HIGHEST_LEVEL) l = HIGHEST_LEVEL;
  const octave = Math.floor(l / 5);
  const semitones = 12 * octave + PENTATONIC[l % 5];
  // every 12 semitones doubles the frequency
  return LOWEST_NOTE * Math.pow(2, semitones / 12);
}

// where the sound goes. deeper code = further to the right.
// x = right, y = up, z = forward (negative z is in front of you)
export function levelToPosition(level) {
  let d = level;
  if (d < 0) d = 0;
  if (d > 8) d = 8;
  return { x: d * 0.45, y: 0, z: -1.2 };
}

// pick out only the steps that make a sound
export function audibleSteps(events) {
  const steps = [];
  for (const ev of events) {
    if (ev.e === "call") {
      steps.push({ sound: "call", level: ev.depth, depth: ev.depth, line: ev.line, fn: ev.fn, args: ev.args });
    } else if (ev.e === "return") {
      // returning from depth 3 plays the note for depth 2 (one step down)
      steps.push({ sound: "return", level: Math.max(0, ev.depth - 1), depth: ev.depth, line: ev.line, fn: ev.fn, value: ev.value });
    } else if (ev.e === "line" && ev.loop != null) {
      steps.push({ sound: "tick", level: ev.depth, depth: ev.depth, line: ev.line, loop: ev.loop });
    }
  }
  return steps;
}

// seconds between one sound and the next.
// short programs play slow and clear. long ones speed up, so runaway code
// sounds like it's spinning out of control.
export function stepInterval(i, total) {
  if (total <= 30) return 0.22;
  return Math.max(0.035, 0.2 * Math.pow(0.955, i));
}

export function buildScore(result) {
  const all = audibleSteps(result.events || []);
  const truncated = all.length > MAX_SOUNDS;
  const steps = all.slice(0, MAX_SOUNDS);

  let time = 0;
  for (let i = 0; i < steps.length; i++) {
    steps[i].t = time;
    steps[i].freq = levelToFreq(steps[i].level);
    steps[i].pos = levelToPosition(steps[i].level);
    time += stepInterval(i, steps.length);
  }

  let ending = "buzz";
  if (result.status === "ok") ending = "chime";

  return { steps: steps, ending: ending, endAt: time + 0.1, truncated: truncated, duration: time + 1.2 };
}
