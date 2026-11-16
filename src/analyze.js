// The analyzer reads what happened during a run and explains it in plain
// English. It is ordinary code (no AI), so the same program always gets the
// same, checkable explanation.
//
// Output: { kind, tone: "ok" | "err", line, text }
//   text can contain `code` in backticks; the caption shows it as code and
//   the voice reads it with speakCode().

import { plural } from "./speakable.js";

const fmt = (n) => n.toLocaleString("en-US");

function countBy(items, key) {
  const m = new Map();
  for (const it of items) m.set(key(it), (m.get(key(it)) || 0) + 1);
  return m;
}

function mostCommon(map) {
  let best = null;
  let bestN = -1;
  for (const [k, n] of map) if (n > bestN) { best = k; bestN = n; }
  return best;
}

function argValues(events, fn, limit = 5) {
  return events
    .filter((e) => e.e === "call" && e.fn === fn && e.args)
    .slice(0, limit)
    .map((e) => e.args.split(", ").map((a) => a.split("=")[1]).join(", "));
}

function firstArgName(events, fn) {
  const ev = events.find((e) => e.e === "call" && e.fn === fn && e.args);
  return ev ? ev.args.split("=")[0] : null;
}

// ------------------------------------------------------------------ recursion
function looksLikeRunawayRecursion(result) {
  if (result.error && result.error.type === "RecursionError") return true;
  if (result.status !== "budget") return false;
  const tail = result.events.slice(-300);
  const calls = tail.filter((e) => e.e === "call").length;
  const rets = tail.filter((e) => e.e === "return").length;
  return result.maxDepth >= 50 && calls > rets * 2;
}

function explainRecursion(result) {
  const { events, functions = {} } = result;
  const calls = events.filter((e) => e.e === "call");
  const fn = mostCommon(countBy(calls, (e) => e.fn));
  const info = functions[fn] || {};
  const line =
    (result.error && result.error.line) || (info.recursiveCallLines || [])[0] || (calls[0] && calls[0].line);

  const parts = [
    `Recursion on line ${line} went ${fmt(result.maxDepth)} calls deep and never came back.`,
  ];

  const values = argValues(events, fn);
  const argName = firstArgName(events, fn);
  if (argName && values.length >= 3) {
    parts.push(`\`${argName}\` went ${values.join(", ")}, and kept going.`);
  }

  if (fn && info.hasIf === false) {
    parts.push(`\`${fn}\` has no \`if\`, so nothing tells it to stop. Add a stop condition.`);
  } else if (fn && info.ifLines && info.ifLines.length) {
    parts.push(
      `\`${fn}\` has a stop condition on line ${info.ifLines[0]}, but it was never reached. Does each call get closer to it?`,
    );
  }
  return { kind: "runaway-recursion", tone: "err", line, text: parts.join(" ") };
}

// ---------------------------------------------------------------------- loops
function loopIterations(events) {
  return countBy(events.filter((e) => e.loop != null), (e) => e.loop);
}

function explainRunawayLoop(result, iterations) {
  const header = mostCommon(iterations);
  const n = iterations.get(header);
  const loop = (result.loops || []).find((l) => l.line === header) || { kind: "while", condVars: [] };
  const parts = [
    `The ${loop.kind} loop on line ${header} ran ${fmt(n)} times and never stopped.`,
  ];

  if (loop.kind === "while") {
    const snaps = (result.loopSnapshots || {})[String(header)] || [];
    if (!loop.condVars || loop.condVars.length === 0) {
      parts.push(`\`while ${loop.test}\` only stops with \`break\`, and no \`break\` ran.`);
    } else if (snaps.length >= 2) {
      const stuck = loop.condVars.filter((v) => snaps.every((s) => s[v] === snaps[0][v]));
      if (stuck.length) {
        const v = stuck[0];
        parts.push(`\`${v}\` was ${snaps[0][v]} every single time. Is \`${v}\` ever changing?`);
      } else {
        const v = loop.condVars[0];
        const seen = snaps.slice(0, 4).map((s) => s[v]).join(", ");
        parts.push(`\`${v}\` keeps changing, ${seen}, and so on, but \`${loop.test}\` never becomes false.`);
      }
    }
  } else {
    parts.push(`It is looping over something very large: \`${loop.test}\`.`);
  }
  return { kind: "runaway-loop", tone: "err", line: header, text: parts.join(" ") };
}

// --------------------------------------------------------------------- errors
const FRIENDLY = {
  ZeroDivisionError: () => "You divided by zero.",
  IndexError: () => "You asked for a position that is not in the list.",
  KeyError: (e) => `The key ${e.message} is not in the dictionary.`,
  TypeError: (e) => `Two things that don't fit together: ${e.message}.`,
};

function explainError(result) {
  const e = result.error;
  const where = e.line ? ` on line ${e.line}` : "";
  if (e.type === "NameError" && e.name) {
    const hint = e.suggestion ? ` Did you mean \`${e.suggestion}\`?` : "";
    return {
      kind: "error", tone: "err", line: e.line,
      text: `Name error${where}: \`${e.name}\` is not defined.${hint}`,
    };
  }
  const friendly = FRIENDLY[e.type] ? " " + FRIENDLY[e.type](e) : "";
  const readableType = e.type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ Error$/, " error");
  return {
    kind: "error", tone: "err", line: e.line,
    text: `${readableType}${where}: ${e.message}.${friendly}`.replace(/\.\./g, "."),
  };
}

// ------------------------------------------------------------------- success
function explainSuccess(result) {
  const parts = ["Done."];
  const calls = result.events.filter((e) => e.e === "call");
  const rets = result.events.filter((e) => e.e === "return");
  const callCounts = countBy(calls, (e) => e.fn);
  const recursive = [...callCounts].filter(([, n]) => n > 1);

  if (recursive.length) {
    const [fn, n] = recursive[0];
    const back = rets.filter((e) => e.fn === fn).length;
    parts.push(
      back === n
        ? `\`${fn}\` was called ${plural(n, "time")}, and every call came back.`
        : `\`${fn}\` was called ${plural(n, "time")}.`,
    );
  }

  const iterations = loopIterations(result.events);
  for (const [header, n] of [...iterations].slice(0, 2)) {
    parts.push(`The loop on line ${header} ran ${plural(n, "time")}.`);
  }

  const lines = (result.output || "").split("\n").filter(Boolean).length;
  if (parts.length === 1) parts.push(lines ? `It printed ${plural(lines, "line")}.` : "It printed nothing.");
  return { kind: "ok", tone: "ok", line: null, text: parts.join(" ") };
}

// ---------------------------------------------------------------------- main
export function analyze(result) {
  if (!result) return { kind: "none", tone: "err", line: null, text: "Nothing ran." };

  if (result.status === "syntax") {
    const e = result.error;
    return {
      kind: "syntax", tone: "err", line: e.line,
      text: `Syntax error on line ${e.line}: ${e.message}.`,
    };
  }
  if (result.status === "timeout") {
    return { kind: "timeout", tone: "err", line: null, text: "Your code ran for too long and was stopped." };
  }
  if (looksLikeRunawayRecursion(result)) return explainRecursion(result);

  if (result.status === "budget") {
    const iterations = loopIterations(result.events);
    if (iterations.size) return explainRunawayLoop(result, iterations);
    return {
      kind: "budget", tone: "err", line: null,
      text: `Your code took more than ${fmt(result.steps)} steps, so it was stopped.`,
    };
  }
  if (result.status === "error") return explainError(result);
  return explainSuccess(result);
}
