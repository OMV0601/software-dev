import { describe as group, it, expect } from "vitest";
import { TreeCursor, describe, describeEdge, nodeName } from "../src/navigator.js";
import { getExample } from "../src/examples.js";
import { pyParse } from "./pyhelpers.js";
import { speakText } from "../src/speakable.js";

const treeOf = (id) => pyParse(getExample(id).code).tree;

group("TreeCursor on the buggy countdown (README example 3)", () => {
  it("walks function -> inside -> statements -> edge, like the README table", () => {
    const c = new TreeCursor(treeOf("recursion-bug"));
    const said = [speakText(describe(c.node))];
    c.enter();
    said.push(speakText(describe(c.node)));
    c.next();
    said.push(speakText(describe(c.node)));
    const edge = c.next();
    said.push(speakText(describeEdge(edge.edge, c)));
    expect(said).toEqual([
      "function countdown, takes n, line 1, 2 statements inside.",
      "print, n, line 2.",
      "countdown of n minus 1, line 3.",
      "End of function countdown.",
    ]);
  });

  it("depth increases going inside and comes back going out", () => {
    const c = new TreeCursor(treeOf("recursion-bug"));
    expect(c.node.depth).toBe(0);
    c.enter();
    expect(c.node.depth).toBe(1);
    c.exit();
    expect(c.node.depth).toBe(0);
    expect(c.exit()).toEqual({ moved: false, edge: "top" });
  });

  it("reports edges instead of moving past them", () => {
    const c = new TreeCursor(treeOf("recursion-bug"));
    expect(c.prev()).toEqual({ moved: false, edge: "start" });
    c.enter(); // print(n)
    expect(c.enter()).toEqual({ moved: false, edge: "leaf" });
  });
});

group("TreeCursor on FizzBuzz (nested blocks)", () => {
  it("puts if / elif / else side by side, the way the code looks", () => {
    const c = new TreeCursor(treeOf("fizzbuzz"));
    expect(c.node.kind).toBe("for");
    c.enter();
    expect(c.parent.children.map((n) => [n.kind, n.line])).toEqual([
      ["if", 2], ["elif", 4], ["elif", 6], ["else", 8],
    ]);
    expect(c.node.children.map((n) => n.kind)).toEqual(["print"]);
  });

  it("keeps `else:` + a nested `if` nested (it is not an elif)", () => {
    const t = pyParse("if x:\n    a = 1\nelse:\n    if y:\n        b = 2\n").tree;
    expect(t.children.map((n) => n.kind)).toEqual(["if", "else"]);
    expect(t.children[1].children[0].kind).toBe("if");
  });

  it("goToLine lands inside the right branch", () => {
    const c = new TreeCursor(treeOf("fizzbuzz"));
    c.goToLine(7);
    expect(c.trail().map((n) => n.label)).toEqual(["for n in range(1, 16)", "elif n % 5 == 0", "print('Buzz')"]);
  });

  it("goToLine jumps to the deepest block on that line", () => {
    const c = new TreeCursor(treeOf("fizzbuzz"));
    c.goToLine(3);
    expect(c.node.line).toBe(3);
    expect(c.trail().map((n) => n.kind)).toEqual(["for", "if", "print"]);
  });

  it("first and last jump within the current level", () => {
    const c = new TreeCursor(treeOf("recursion-fixed"));
    c.enter();
    c.last();
    expect(c.node.line).toBe(5);
    c.first();
    expect(c.node.line).toBe(2);
  });
});

group("describing nodes", () => {
  it("speaks conditions and loops naturally", () => {
    const t = treeOf("loop-fixed");
    expect(speakText(describe(t.children[0]))).toBe("count becomes 1, line 1.");
    expect(speakText(describe(t.children[1]))).toBe(
      "while loop, while count is less than or equal to 3, line 2, 2 statements inside.",
    );
  });

  it("names functions with no arguments", () => {
    expect(nodeName({ kind: "function", label: "main()" })).toBe("function `main`, takes nothing");
  });

  it("handles an empty program", () => {
    const c = new TreeCursor(pyParse("").tree);
    expect(c.empty).toBe(true);
    expect(c.next().edge).toBe("empty");
  });
});
