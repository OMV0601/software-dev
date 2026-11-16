// Turns a trace (the list of steps Python took) into a "score": a list of
// sounds with timings. Pure functions, no audio here, so it is easy to test.
//
//   call    -> a note one step HIGHER (going up the stairs)
//   return  -> a note one step LOWER  (coming back down)
//   loop    -> a tick each time a loop goes round
//   end     -> chime if it finished, buzz if something went wrong

// Major pentatonic scale: any two notes sound good together.
const PENTATONIC = [0, 2, 4, 7, 9];
const BASE_FREQ = 196; // G3
const MAX_LEVEL = 24;  // about 5 octaves; deeper than this stays at the top

export const MAX_AUDIBLE_STEPS = 90;

/** Frequency (Hz) for a stair level 0, 1, 2… on the pentatonic scale. */
export function levelToFreq(level) {
  const l = Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
  const octave = Math.floor(l / PENTATONIC.length);
  const semitones = 12 * octave + PENTATONIC[l % PENTATONIC.length];
  return BASE_FREQ * Math.pow(2, semitones / 12);
}

/** Where a sound sits around your head. Deeper = further to the right. */
export function levelToPosition(level) {
  const d = Math.max(0, Math.min(8, level));
  return { x: d * 0.45, y: 0, z: -1.2 };
}

/** Pick out the events that make a sound. */
export function audibleSteps(events) {
  const steps = [];
  for (const ev of events) {
    if (ev.e === "call") {
      steps.push({ sound: "call", level: ev.depth, depth: ev.depth, line: ev.line, fn: ev.fn, args: ev.args });
    } else if (ev.e === "return") {
      steps.push({ sound: "return", level: Math.max(0, ev.depth - 1), depth: ev.depth, line: ev.line, fn: ev.fn, value: ev.value });
    } else if (ev.e === "line" && ev.loop != null) {
      steps.push({ sound: "tick", level: ev.depth, depth: ev.depth, line: ev.line, loop: ev.loop });
    }
  }
  return steps;
}

/** Seconds between step i and step i+1. Short programs play slowly and clearly;
 *  long ones speed up, so runaway code sounds like it is spiralling away. */
export function stepInterval(i, total) {
  if (total <= 30) return 0.22;
  return Math.max(0.035, 0.2 * Math.pow(0.955, i));
}

/**
 * Build the full score for a run result.
 * @returns {{ steps: Array, ending: "chime"|"buzz", truncated: boolean, duration: number }}
 */
export function buildScore(result) {
  const all = audibleSteps(result.events || []);
  const truncated = all.length > MAX_AUDIBLE_STEPS;
  const steps = truncated ? all.slice(0, MAX_AUDIBLE_STEPS) : all;

  let t = 0;
  steps.forEach((s, i) => {
    s.t = t;
    s.freq = levelToFreq(s.level);
    s.pos = levelToPosition(s.level);
    t += stepInterval(i, steps.length);
  });

  const ending = result.status === "ok" ? "chime" : "buzz";
  return { steps, ending, endAt: t + 0.1, truncated, duration: t + 1.2 };
}
