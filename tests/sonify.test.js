import { describe, it, expect } from "vitest";
import { audibleSteps, buildScore, levelToFreq, levelToPosition, MAX_SOUNDS } from "../src/sonify.js";

const call = (depth) => ({ e: "call", line: 1, depth, fn: "f" });
const ret = (depth) => ({ e: "return", line: 3, depth, fn: "f" });

describe("levelToFreq", () => {
  it("goes up with each level", () => {
    for (let l = 0; l < 20; l++) expect(levelToFreq(l + 1)).toBeGreaterThan(levelToFreq(l));
  });
  it("is an octave higher every 5 levels (pentatonic)", () => {
    expect(levelToFreq(5) / levelToFreq(0)).toBeCloseTo(2, 5);
  });
  it("clamps very deep levels so it stays audible", () => {
    expect(levelToFreq(500)).toBe(levelToFreq(24));
    expect(levelToFreq(-3)).toBe(levelToFreq(0));
  });
});

describe("levelToPosition", () => {
  it("moves deeper code to the right", () => {
    expect(levelToPosition(0).x).toBe(0);
    expect(levelToPosition(3).x).toBeGreaterThan(levelToPosition(1).x);
  });
});

describe("audibleSteps", () => {
  it("turns calls up and returns down like stairs", () => {
    const events = [call(1), call(2), call(3), ret(3), ret(2), ret(1)];
    const levels = audibleSteps(events).map((s) => s.level);
    expect(levels).toEqual([1, 2, 3, 2, 1, 0]);
  });
  it("ticks once per loop iteration and ignores ordinary lines", () => {
    const events = [
      { e: "line", line: 1, depth: 0 },
      { e: "line", line: 3, depth: 0, loop: 2 },
      { e: "out", text: "1", depth: 0 },
      { e: "line", line: 3, depth: 0, loop: 2 },
    ];
    const steps = audibleSteps(events);
    expect(steps.map((s) => s.sound)).toEqual(["tick", "tick"]);
  });
});

describe("buildScore", () => {
  it("chimes when the program finished", () => {
    expect(buildScore({ status: "ok", events: [call(1), ret(1)] }).ending).toBe("chime");
  });
  it("buzzes on errors and runaway code", () => {
    expect(buildScore({ status: "error", events: [] }).ending).toBe("buzz");
    expect(buildScore({ status: "budget", events: [] }).ending).toBe("buzz");
    expect(buildScore({ status: "timeout", events: [] }).ending).toBe("buzz");
  });
  it("caps very long runs and marks them truncated", () => {
    const events = Array.from({ length: 400 }, (_, i) => call(i + 1));
    const score = buildScore({ status: "error", events });
    expect(score.steps).toHaveLength(MAX_SOUNDS);
    expect(score.truncated).toBe(true);
  });
  it("speeds up long runs so they sound like they are spiralling", () => {
    const events = Array.from({ length: 80 }, (_, i) => call(i + 1));
    const { steps } = buildScore({ status: "error", events });
    const first = steps[1].t - steps[0].t;
    const last = steps[79].t - steps[78].t;
    expect(last).toBeLessThan(first);
  });
  it("keeps timings strictly increasing", () => {
    const events = [call(1), call(2), ret(2), ret(1)];
    const { steps } = buildScore({ status: "ok", events });
    for (let i = 1; i < steps.length; i++) expect(steps[i].t).toBeGreaterThan(steps[i - 1].t);
  });
});
