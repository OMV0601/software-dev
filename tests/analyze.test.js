import { describe, it, expect } from "vitest";
import { analyze } from "../src/analyze.js";
import { getExample } from "../src/examples.js";
import { pyTrace } from "./pyhelpers.js";

const run = (id) => analyze(pyTrace(getExample(id).code));

describe("analyze: the demo examples", () => {
  it("runaway recursion: names the line, the values and the missing if", () => {
    const a = run("recursion-bug");
    expect(a.kind).toBe("runaway-recursion");
    expect(a.line).toBe(3);
    expect(a.text).toMatch(/^Recursion on line 3 went \d+ calls deep and never came back\./);
    expect(a.text).toContain("`n` went 3, 2, 1, 0, -1, and kept going.");
    expect(a.text).toContain("`countdown` has no `if`");
  });

  it("fixed recursion: every call came back", () => {
    const a = run("recursion-fixed");
    expect(a.tone).toBe("ok");
    expect(a.text).toBe("Done. `countdown` was called 4 times, and every call came back.");
  });

  it("runaway while loop: spots the variable that never changes", () => {
    const a = run("loop-bug");
    expect(a.kind).toBe("runaway-loop");
    expect(a.line).toBe(2);
    expect(a.text).toMatch(/^The while loop on line 2 ran [\d,]+ times and never stopped\./);
    expect(a.text).toContain("`count` was 1 every single time. Is `count` ever changing?");
  });

  it("fixed loop: counts the rounds", () => {
    expect(run("loop-fixed").text).toBe("Done. The loop on line 2 ran 3 times.");
  });

  it("typo: suggests the real name", () => {
    const a = run("typo");
    expect(a.line).toBe(3);
    expect(a.text).toBe("Name error on line 3: `totl` is not defined. Did you mean `total`?");
  });

  it("working recursion with a return value", () => {
    expect(run("factorial").text).toBe("Done. `factorial` was called 5 times, and every call came back.");
  });
});

describe("analyze: other cases", () => {
  it("stop condition that is never reached", () => {
    const a = analyze(pyTrace(`def down(n):
    if n == 0:
        return
    down(n - 2)

down(5)
`));
    expect(a.kind).toBe("runaway-recursion");
    expect(a.text).toContain("has a stop condition on line 2, but it was never reached");
  });

  it("variable changes but the condition never becomes false", () => {
    const a = analyze(pyTrace(`x = 1
while x != 10:
    x = x + 2
`));
    expect(a.kind).toBe("runaway-loop");
    expect(a.text).toContain("`x` keeps changing, 1, 3, 5, 7, and so on, but `x != 10` never becomes false.");
  });

  it("while True without break", () => {
    const a = analyze(pyTrace(`while True:
    pass
`));
    expect(a.text).toContain("`while True` only stops with `break`");
  });

  it("syntax errors give the line", () => {
    const a = analyze(pyTrace(`def f(:
    pass
`));
    expect(a.kind).toBe("syntax");
    expect(a.line).toBe(1);
    expect(a.text).toMatch(/^Syntax error on line 1:/);
  });

  it("division by zero is explained in plain words", () => {
    const a = analyze(pyTrace("print(1 / 0)\n"));
    expect(a.text).toContain("You divided by zero.");
  });

  it("a plain program reports how much it printed", () => {
    expect(analyze(pyTrace('print("hi")\n')).text).toBe("Done. It printed 1 line.");
  });

  it("a long loop that does finish is reported as finished", () => {
    const a = analyze(pyTrace("total = 0\nfor i in range(10000):\n    total += i\n"));
    expect(a.text).toBe("Done. The loop on line 2 ran 10,000 times.");
  });

  it("deep recursion that does finish is reported as finished", () => {
    const a = analyze(pyTrace("def f(n):\n    if n == 0:\n        return 0\n    return 1 + f(n - 1)\nprint(f(500))\n"));
    expect(a.text).toBe("Done. `f` was called 501 times, and every call came back.");
  });

  it("misspelled return suggests return", () => {
    const a = analyze(pyTrace("def f(n):\n    if n == 0:\n        retur\n    f(n - 1)\nf(3)\n"));
    expect(a.text).toBe("Name error on line 3: `retur` is not defined. Did you mean `return`?");
  });

  it("indentation errors are called indentation errors", () => {
    const a = analyze(pyTrace("if True:\nprint(1)\n"));
    expect(a.text).toMatch(/^Indentation error on line 2:/);
  });

  it("lines indented under a return are called out (the mistake from filming)", () => {
    const a = analyze(pyTrace("def countdown(n):\n    if n == 0:\n        return\n        print(n)\n" +
      "        countdown(n - 1)\n\ncountdown(3)\n"));
    expect(a.kind).toBe("unreachable");
    expect(a.tone).toBe("err");
    expect(a.line).toBe(4);
    expect(a.text).toBe("Your code finished, but lines 4 to 5 never run, because they come after the " +
      "`return` on line 3. Should they be indented less?");
  });

  it("timeout", () => {
    expect(analyze({ status: "timeout", events: [] }).kind).toBe("timeout");
  });

  it("an except Exception cannot hide an infinite loop", () => {
    const a = analyze(pyTrace(`n = 0
while n < 5:
    try:
        print(n)
    except Exception:
        pass
`));
    expect(a.kind).toBe("runaway-loop");
  });
});
