// Turns code into something a voice can say naturally.
//
//   "count = count + 1"   -> "count becomes count plus 1"
//   "if n == 0"           -> "if n equals 0"
//   "countdown(n - 1)"    -> "countdown of n minus 1"
//
// Screen readers read symbols one by one ("left paren, n, minus…"). This reads
// code the way a teacher would say it out loud.

const RULES = [
  [/\*\*/g, " to the power of "],
  [/\/\//g, " floor divided by "],
  [/==/g, " equals "],
  [/!=/g, " is not equal to "],
  [/<=/g, " is less than or equal to "],
  [/>=/g, " is greater than or equal to "],
  [/\+=/g, " increases by "],
  [/-=/g, " decreases by "],
  [/\*=/g, " is multiplied by "],
  [/->/g, " returns "],
  [/</g, " is less than "],
  [/>/g, " is greater than "],
  [/(^|[^=!<>])=(?!=)/g, "$1 becomes "],
  [/\+/g, " plus "],
  [/(\w|\)|\])\s*-\s*/g, "$1 minus "],
  [/(^|[\s(,[])-(\d)/g, "$1negative $2"],
  [/\*/g, " times "],
  [/\//g, " divided by "],
  [/%/g, " mod "],
  [/([A-Za-z_]\w*)\(\)/g, "$1, with nothing inside"],
  [/([A-Za-z_]\w*)\(/g, "$1 of "],
  [/\[\]/g, " empty list "],
  [/\[/g, " list "],
  [/["']/g, " "],
  [/[)\]{}:]/g, " "],
  [/\./g, " dot "],
  [/_/g, " "],
];

export function speakCode(code) {
  let s = ` ${String(code)} `;
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  return s.replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
}

/** Speak a sentence that contains `code in backticks`. */
export function speakText(text) {
  return String(text).replace(/`([^`]*)`/g, (_, c) => speakCode(c));
}

export function plural(n, one, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}
