// Works out what happened when the code ran and explains it in plain English.
// It's just normal if-statements and counting, no AI, so the same code
// always gets the same explanation.
//
// Gives back: { kind, tone, line, text }
//   tone is "ok" or "err"
//   text can have `code` in backticks (the voice reads that part specially)

import { plural } from "./speakable.js";

// 1000 -> "1,000"
function withCommas(n) {
  return n.toLocaleString("en-US");
}

// counts how many times each thing appears, e.g. {countdown: 4}
function countEach(list) {
  const counts = {};
  for (const item of list) {
    if (counts[item] === undefined) counts[item] = 0;
    counts[item]++;
  }
  return counts;
}

// the key with the biggest count
function mostCommon(counts) {
  let best = null;
  let bestCount = -1;
  for (const key in counts) {
    if (counts[key] > bestCount) {
      best = key;
      bestCount = counts[key];
    }
  }
  return best;
}

function callEvents(events) {
  const calls = [];
  for (const ev of events) if (ev.e === "call") calls.push(ev);
  return calls;
}

// how many times each loop went round, e.g. {"2": 3} means the loop on line 2 ran 3 times
function loopRounds(result) {
  // Python counts these for the whole run (we only keep the first 4000 events)
  if (result.loopCounts) return result.loopCounts;
  const loopLines = [];
  for (const ev of result.events) if (ev.loop != null) loopLines.push(ev.loop);
  return countEach(loopLines);
}

// "ZeroDivisionError" -> "Zero division error", "SyntaxError" -> "Syntax error"
function readableName(type) {
  const words = type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---------- runaway recursion ----------

function isRunawayRecursion(result) {
  if (result.error && result.error.type === "RecursionError") return true;
  if (result.status !== "budget") return false;
  // or: it got stopped while it was still really deep inside function calls
  return (result.depthAtEnd || 0) >= 50;
}

function explainRecursion(result) {
  const calls = callEvents(result.events);
  const fnNames = [];
  for (const c of calls) fnNames.push(c.fn);
  const fn = mostCommon(countEach(fnNames));
  const info = (result.functions || {})[fn] || {};

  // which line made the call that went too deep
  let line = null;
  if (result.error && result.error.line) line = result.error.line;
  else if (info.recursiveCallLines && info.recursiveCallLines.length) line = info.recursiveCallLines[0];
  else if (calls.length) line = calls[0].line;

  let text = `Recursion on line ${line} went ${withCommas(result.maxDepth)} calls deep and never came back.`;

  // show the first few argument values, e.g. "n went 3, 2, 1, 0, -1"
  const values = [];
  let argName = null;
  for (const c of calls) {
    if (c.fn !== fn || !c.args) continue;
    // c.args looks like "n=3" (only using the first argument to keep it simple)
    const firstArg = c.args.split(", ")[0];
    argName = firstArg.split("=")[0];
    values.push(firstArg.split("=")[1]);
    if (values.length === 5) break;
  }
  if (argName && values.length >= 3) {
    text += ` \`${argName}\` went ${values.join(", ")}, and kept going.`;
  }

  if (fn && info.hasIf === false) {
    text += ` \`${fn}\` has no \`if\`, so nothing tells it to stop. Add a stop condition.`;
  } else if (fn && info.ifLines && info.ifLines.length) {
    text += ` \`${fn}\` has a stop condition on line ${info.ifLines[0]}, but it was never reached. Does each call get closer to it?`;
  }
  return { kind: "runaway-recursion", tone: "err", line: line, text: text };
}

// ---------- runaway loop ----------

function explainRunawayLoop(result, rounds) {
  const loopLine = Number(mostCommon(rounds));
  const count = rounds[loopLine];
  let loop = { kind: "while", condVars: [], test: "" };
  for (const l of result.loops || []) {
    if (l.line === loopLine) loop = l;
  }

  let text = `The ${loop.kind} loop on line ${loopLine} ran ${withCommas(count)} times and never stopped.`;

  if (loop.kind === "while") {
    const snapshots = (result.loopSnapshots || {})[String(loopLine)] || [];
    if (loop.condVars.length === 0) {
      // like "while True:"
      text += ` \`while ${loop.test}\` only stops with \`break\`, and no \`break\` ran.`;
    } else if (snapshots.length >= 2) {
      // look for a variable in the condition that never changed
      let stuckVar = null;
      for (const v of loop.condVars) {
        let alwaysSame = true;
        for (const snap of snapshots) {
          if (snap[v] !== snapshots[0][v]) alwaysSame = false;
        }
        if (alwaysSame) {
          stuckVar = v;
          break;
        }
      }
      if (stuckVar) {
        text += ` \`${stuckVar}\` was ${snapshots[0][stuckVar]} every single time. Is \`${stuckVar}\` ever changing?`;
      } else {
        const v = loop.condVars[0];
        const firstFew = [];
        for (const snap of snapshots.slice(0, 4)) firstFew.push(snap[v]);
        text += ` \`${v}\` keeps changing, ${firstFew.join(", ")}, and so on, but \`${loop.test}\` never becomes false.`;
      }
    }
  } else {
    text += ` It is looping over something very large: \`${loop.test}\`.`;
  }
  return { kind: "runaway-loop", tone: "err", line: loopLine, text: text };
}

// ---------- errors ----------

function explainError(result) {
  const err = result.error;
  let where = "";
  if (err.line) where = ` on line ${err.line}`;

  if (err.type === "NameError" && err.name) {
    let text = `Name error${where}: \`${err.name}\` is not defined.`;
    if (err.suggestion) text += ` Did you mean \`${err.suggestion}\`?`;
    return { kind: "error", tone: "err", line: err.line, text: text };
  }

  // extra plain-English help for common errors
  let extra = "";
  if (err.type === "ZeroDivisionError") extra = " You divided by zero.";
  if (err.type === "IndexError") extra = " You asked for a position that is not in the list.";
  if (err.type === "KeyError") extra = ` The key ${err.message} is not in the dictionary.`;
  if (err.type === "TypeError") extra = ` Two things that don't fit together: ${err.message}.`;

  let text = `${readableName(err.type)}${where}: ${err.message}.${extra}`;
  text = text.replaceAll("..", ".");
  return { kind: "error", tone: "err", line: err.line, text: text };
}

// ---------- it ran, but some lines can never run ----------
// e.g. print(n) indented under a return by accident. Python doesn't complain,
// so a blind student would never know without being told.
function explainUnreachable(result) {
  const u = result.unreachable[0];
  let lines = `line ${u.fromLine} never runs`;
  if (u.toLine > u.fromLine) lines = `lines ${u.fromLine} to ${u.toLine} never run`;
  const text = `Your code finished, but ${lines}, because ${u.toLine > u.fromLine ? "they come" : "it comes"} ` +
    `after the \`${u.word}\` on line ${u.stopLine}. Should ${u.toLine > u.fromLine ? "they" : "it"} be indented less?`;
  return { kind: "unreachable", tone: "err", line: u.fromLine, text: text };
}

// ---------- it worked ----------

function explainSuccess(result) {
  let text = "Done.";
  let addedSomething = false;

  // a function that got called more than once (usually recursion)
  const callCounts = result.callCounts || {};
  const returnCounts = result.returnCounts || {};
  for (const fn in callCounts) {
    const n = callCounts[fn];
    if (n <= 1) continue;
    const returned = returnCounts[fn] || 0;
    if (returned === n) text += ` \`${fn}\` was called ${plural(n, "time")}, and every call came back.`;
    else text += ` \`${fn}\` was called ${plural(n, "time")}.`;
    addedSomething = true;
    break; // just talk about the first one
  }

  // loops (only the first 2 so it doesn't talk forever)
  const rounds = loopRounds(result);
  let loopsSaid = 0;
  for (const loopLine in rounds) {
    if (loopsSaid === 2) break;
    const n = rounds[loopLine];
    text += ` The loop on line ${loopLine} ran ${withCommas(n)} ${n === 1 ? "time" : "times"}.`;
    loopsSaid++;
    addedSomething = true;
  }

  if (!addedSomething) {
    const lines = (result.output || "").split("\n").filter((l) => l !== "").length;
    if (lines > 0) text += ` It printed ${plural(lines, "line")}.`;
    else text += " It printed nothing.";
  }
  return { kind: "ok", tone: "ok", line: null, text: text };
}

// ---------- main function ----------

export function analyze(result) {
  if (!result) return { kind: "none", tone: "err", line: null, text: "Nothing ran." };

  if (result.status === "syntax") {
    const err = result.error;
    const name = readableName(err.type || "SyntaxError");
    return { kind: "syntax", tone: "err", line: err.line, text: `${name} on line ${err.line}: ${err.message}.` };
  }
  if (result.status === "timeout") {
    return { kind: "timeout", tone: "err", line: null, text: "Your code ran for too long and was stopped." };
  }
  if (isRunawayRecursion(result)) return explainRecursion(result);

  if (result.status === "budget") {
    const rounds = loopRounds(result);
    if (Object.keys(rounds).length > 0) return explainRunawayLoop(result, rounds);
    return { kind: "budget", tone: "err", line: null, text: `Your code took more than ${withCommas(result.steps)} steps, so it was stopped.` };
  }
  if (result.status === "error") return explainError(result);
  if (result.unreachable && result.unreachable.length > 0) return explainUnreachable(result);
  return explainSuccess(result);
}
