import { describe, it, expect } from "vitest";
import { speakCode, speakText } from "../src/speakable.js";

describe("speakCode", () => {
  it.each([
    ["count = count + 1", "count becomes count plus 1"],
    ["if n == 0", "if n equals 0"],
    ["while count <= 3", "while count is less than or equal to 3"],
    ["countdown(n - 1)", "countdown of n minus 1"],
    ["print(n)", "print of n"],
    ["n % 15 == 0", "n mod 15 equals 0"],
    ["total += price", "total increases by price"],
    ["x != y", "x is not equal to y"],
    ["names.append(x)", "names dot append of x"],
    ["total_price", "total price"],
    ["f()", "f, with nothing inside"],
    ["print(-1)", "print of minus 1"],
  ])("%s -> %s", (code, spoken) => {
    expect(speakCode(code)).toBe(spoken);
  });
});

describe("speakText", () => {
  it("only converts the code in backticks", () => {
    expect(speakText("Is `count` ever changing? Try `count = count + 1`."))
      .toBe("Is count ever changing? Try count becomes count plus 1.");
  });
});
