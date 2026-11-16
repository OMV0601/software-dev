import { describe, it, expect } from "vitest";
import {
  makeCursor, isEmpty, currentNode, parentNode, moveNext, movePrev, moveInside, moveOutside,
  moveFirst, moveLast, goToLine, getTrail, describeNode, describeEdge, nodeName,
} from "../src/navigator.js";
import { getExample } from "../src/examples.js";
import { pyParse } from "./pyhelpers.js";
import { speakText } from "../src/speakable.js";

const treeOf = (id) => pyParse(getExample(id).code).tree;

describe("cursor on the buggy countdown (README example 3)", () => {
  it("walks function -> inside -> statements -> edge, like the README table", () => {
    const c = makeCursor(treeOf("recursion-bug"));
    const said = [speakText(describeNode(currentNode(c)))];
    moveInside(c);
    said.push(speakText(describeNode(currentNode(c))));
    moveNext(c);
    said.push(speakText(describeNode(currentNode(c))));
    const edge = moveNext(c);
    said.push(speakText(describeEdge(edge.edge, c)));
    expect(said).toEqual([
      "function countdown, takes n, line 1, 2 statements inside.",
      "print, n, line 2.",
      "countdown of n minus 1, line 3.",
      "End of function countdown.",
    ]);
  });

  it("depth goes up going inside and back down going out", () => {
    const c = makeCursor(treeOf("recursion-bug"));
    expect(currentNode(c).depth).toBe(0);
    moveInside(c);
    expect(currentNode(c).depth).toBe(1);
    moveOutside(c);
    expect(currentNode(c).depth).toBe(0);
    expect(moveOutside(c)).toEqual({ moved: false, edge: "top" });
  });

  it("reports edges instead of moving past them", () => {
    const c = makeCursor(treeOf("recursion-bug"));
    expect(movePrev(c)).toEqual({ moved: false, edge: "start" });
    moveInside(c); // print(n)
    expect(moveInside(c)).toEqual({ moved: false, edge: "leaf" });
  });
});

describe("cursor on FizzBuzz (nested blocks)", () => {
  it("puts if / elif / else side by side, the way the code looks", () => {
    const c = makeCursor(treeOf("fizzbuzz"));
    expect(currentNode(c).kind).toBe("for");
    moveInside(c);
    const siblings = parentNode(c).children.map((n) => [n.kind, n.line]);
    expect(siblings).toEqual([["if", 2], ["elif", 4], ["elif", 6], ["else", 8]]);
    expect(currentNode(c).children.map((n) => n.kind)).toEqual(["print"]);
  });

  it("keeps `else:` + a nested `if` nested (it is not an elif)", () => {
    const t = pyParse("if x:\n    a = 1\nelse:\n    if y:\n        b = 2\n").tree;
    expect(t.children.map((n) => n.kind)).toEqual(["if", "else"]);
    expect(t.children[1].children[0].kind).toBe("if");
  });

  it("goToLine lands inside the right branch", () => {
    const c = makeCursor(treeOf("fizzbuzz"));
    goToLine(c, 7);
    expect(getTrail(c).map((n) => n.label)).toEqual(["for n in range(1, 16)", "elif n % 5 == 0", "print('Buzz')"]);
  });

  it("goToLine finds the deepest block on a line", () => {
    const c = makeCursor(treeOf("fizzbuzz"));
    goToLine(c, 3);
    expect(currentNode(c).line).toBe(3);
    expect(getTrail(c).map((n) => n.kind)).toEqual(["for", "if", "print"]);
  });

  it("first and last jump within the current level", () => {
    const c = makeCursor(treeOf("recursion-fixed"));
    moveInside(c);
    moveLast(c);
    expect(currentNode(c).line).toBe(5);
    moveFirst(c);
    expect(currentNode(c).line).toBe(2);
  });
});

describe("describing blocks", () => {
  it("reads conditions and loops naturally", () => {
    const t = treeOf("loop-fixed");
    expect(speakText(describeNode(t.children[0]))).toBe("count becomes 1, line 1.");
    expect(speakText(describeNode(t.children[1]))).toBe(
      "while loop, while count is less than or equal to 3, line 2, 2 statements inside.",
    );
  });

  it("names functions with no arguments", () => {
    expect(nodeName({ kind: "function", label: "main()" })).toBe("function `main`, takes nothing");
  });

  it("handles an empty program", () => {
    const c = makeCursor(pyParse("").tree);
    expect(isEmpty(c)).toBe(true);
    expect(moveNext(c).edge).toBe("empty");
  });
});
