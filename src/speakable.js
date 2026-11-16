// Makes code sound normal when it's read out loud.
//
//   "count = count + 1"  ->  "count becomes count plus 1"
//   "if n == 0"          ->  "if n equals 0"
//   "countdown(n - 1)"   ->  "countdown of n minus 1"
//
// A normal screen reader would say "left paren, n, minus, 1, right paren".

// ORDER MATTERS: "==" has to be replaced before "=", "<=" before "<", and so on,
// otherwise "==" would turn into "becomes becomes".
const REPLACEMENTS = [
  ["**", " to the power of "],
  ["//", " floor divided by "],
  ["==", " equals "],
  ["!=", " is not equal to "],
  ["<=", " is less than or equal to "],
  [">=", " is greater than or equal to "],
  ["+=", " increases by "],
  ["-=", " decreases by "],
  ["*=", " is multiplied by "],
  ["->", " returns "],
  ["<", " is less than "],
  [">", " is greater than "],
  ["=", " becomes "],
  ["+", " plus "],
  ["-", " minus "],
  ["*", " times "],
  ["/", " divided by "],
  ["%", " mod "],
  ["()", ", with nothing inside"],
  ["(", " of "],
  ["[]", " empty list "],
  ["[", " list "],
  ['"', " "],
  ["'", " "],
  [")", " "],
  ["]", " "],
  ["{", " "],
  ["}", " "],
  [":", " "],
  [".", " dot "],
  ["_", " "],
];

export function speakCode(code) {
  let text = String(code);
  for (const pair of REPLACEMENTS) {
    text = text.replaceAll(pair[0], pair[1]);
  }
  // tidy up: no double spaces, and no space before a comma
  while (text.includes("  ")) text = text.replaceAll("  ", " ");
  text = text.replaceAll(" ,", ",");
  return text.trim();
}

// only the parts inside `backticks` are code, the rest is normal English
export function speakText(text) {
  const parts = String(text).split("`");
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    // odd-numbered parts were between backticks
    if (i % 2 === 1) result += speakCode(parts[i]);
    else result += parts[i];
  }
  return result;
}

// plural(3, "time") -> "3 times", plural(1, "time") -> "1 time"
export function plural(count, word) {
  if (count === 1) return count + " " + word;
  return count + " " + word + "s";
}
