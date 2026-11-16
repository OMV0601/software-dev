// Visuals for people who can see the screen (teachers, judges, the demo video).
// The real product is the sound. These just SHOW what you're hearing.
//
//  1. "Where the sound is": your head from above, with a dot wherever a sound
//     comes from. Deeper code = further right.
//  2. "Pitch over time": a graph of the notes. Working recursion looks like a
//     mountain (up then down). Broken recursion just keeps climbing.

let spaceCanvas, spaceCtx;
let pitchCanvas, pitchCtx;
let colors = {};

let dots = [];        // sounds currently showing on the head view
let points = [];      // steps drawn on the pitch graph so far
let totalSteps = 10;
let maxLevel = 6;
let ending = null;    // { tone, label } once the run is finished

// colours come from the CSS variables in styles.css so everything matches
function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// which colour each kind of sound gets
const DOT_COLORS = {
  call: "accent", return: "accent", tick: "warm", edge: "muted",
  function: "accent", class: "accent", for: "warm", while: "warm",
  if: "ok", elif: "ok", else: "ok", try: "ok", except: "ok", finally: "ok",
  error: "err", done: "ok",
};

export function setupVisuals(spaceElement, pitchElement) {
  spaceCanvas = spaceElement;
  pitchCanvas = pitchElement;
  spaceCtx = spaceCanvas.getContext("2d");
  pitchCtx = pitchCanvas.getContext("2d");
  colors = {
    bg: cssColor("--panel"), line: cssColor("--line"), text: cssColor("--text"),
    muted: cssColor("--muted"), accent: cssColor("--accent"), warm: cssColor("--warm"),
    ok: cssColor("--ok"), err: cssColor("--err"),
  };
  // remember the shape from the HTML (width/height attributes)
  spaceCanvas.dataset.ratio = spaceCanvas.height / spaceCanvas.width;
  pitchCanvas.dataset.ratio = pitchCanvas.height / pitchCanvas.width;
  resizeCanvases();
  window.addEventListener("resize", resizeCanvases);

  // redraw the head view 60 times a second so the dots can fade out smoothly
  function animate() {
    drawSpace();
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

// make the canvases fit their box. We draw at 2x size so it's sharp on
// high-res screens, then scale(2, 2) so we can still use normal sizes.
function resizeCanvases() {
  for (const canvas of [spaceCanvas, pitchCanvas]) {
    const width = canvas.clientWidth;
    if (width === 0) continue;
    const height = Math.round(width * Number(canvas.dataset.ratio));
    canvas.style.height = height + "px";
    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.getContext("2d").setTransform(2, 0, 0, 2, 0, 0);
  }
  drawPitch();
}

// ---------- head view ----------

export function addSoundDot(pos, kind, label) {
  dots.push({ pos: pos, kind: kind || "call", label: label || "", born: performance.now() });
  if (dots.length > 40) dots.shift(); // don't keep too many
}

function drawSpace() {
  const ctx = spaceCtx;
  const w = spaceCanvas.width / 2;
  const h = spaceCanvas.height / 2;
  ctx.clearRect(0, 0, w, h);

  // the head is on the left, sounds spread out to the right
  const headX = w * 0.2;
  const headY = h * 0.62;
  const headR = Math.min(w, h) * 0.085;
  const unit = (w * 0.74) / 3.6; // the furthest sound (x = 3.6) reaches the right side

  // dotted lines for each depth
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  for (let d = 0; d <= 8; d++) {
    const x = headX + d * 0.45 * unit;
    ctx.strokeStyle = colors.line;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x, h - 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.muted;
    ctx.fillText(d === 0 ? "depth 0" : String(d), x, h - 4);
  }
  ctx.globalAlpha = 1;

  // the head (seen from above): circle, nose pointing up, two ears
  ctx.fillStyle = colors.bg;
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(headX, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(headX - headR * 0.28, headY - headR * 0.92);
  ctx.lineTo(headX, headY - headR * 1.32);
  ctx.lineTo(headX + headR * 0.28, headY - headR * 0.92);
  ctx.stroke();
  ctx.fillStyle = colors.text;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(headX + side * headR, headY, headR * 0.18, headR * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = colors.muted;
  ctx.fillText("L", headX - headR * 1.7, headY + 4);
  ctx.fillText("R", headX + headR * 1.7, headY + 4);
  ctx.fillText("you", headX, headY + headR + 16);

  // the dots. each one fades out over 1.6 seconds
  const now = performance.now();
  dots = dots.filter((dot) => now - dot.born < 1600);
  const newest = dots[dots.length - 1];
  for (const dot of dots) {
    const age = (now - dot.born) / 1600; // 0 = brand new, 1 = gone
    // 3D position -> spot on the canvas (z is forward, which is "up" on screen)
    const x = headX + dot.pos.x * unit;
    const y = headY + dot.pos.z * unit * 0.85 - dot.pos.y * unit * 0.4;
    const color = colors[DOT_COLORS[dot.kind] || "accent"];

    ctx.globalAlpha = Math.max(0, 1 - age);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 8 + age * 26, 0, Math.PI * 2); // ring that gets bigger
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();

    // faint line from your head to the sound
    ctx.globalAlpha = Math.max(0, 0.35 - age * 0.35);
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(x, y);
    ctx.stroke();

    // only label the newest dot, otherwise the labels pile on top of each other
    if (dot === newest && dot.label && age < 0.9) {
      ctx.globalAlpha = Math.min(1, 1.6 - age * 1.6);
      ctx.fillStyle = colors.text;
      ctx.font = "600 13px monospace";
      const half = ctx.measureText(dot.label).width / 2 + 4;
      const labelX = Math.max(half, Math.min(x, w - half)); // keep it on screen
      ctx.fillText(dot.label, labelX, y - 18);
      ctx.font = "11px sans-serif";
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- pitch graph ----------

export function resetPitchGraph(score) {
  points = [];
  ending = null;
  totalSteps = 10;
  maxLevel = 6;
  if (score) {
    totalSteps = Math.max(score.steps.length, 10);
    for (const step of score.steps) {
      if (step.level + 1 > maxLevel) maxLevel = step.level + 1;
    }
    if (maxLevel > 24) maxLevel = 24; // same top as the sound
  }
  drawPitch();
}

export function addPitchStep(step) {
  points.push(step);
  drawPitch();
}

export function finishPitchGraph(tone, label) {
  ending = { tone: tone, label: label };
  drawPitch();
}

function drawPitch() {
  if (!pitchCtx) return;
  const ctx = pitchCtx;
  const w = pitchCanvas.width / 2;
  const h = pitchCanvas.height / 2;
  const left = 30, right = 16, top = 14, bottom = 22;
  const graphW = w - left - right;
  const graphH = h - top - bottom;

  // step number -> x, level -> y (higher level = higher up)
  function xFor(i) {
    return left + (i / Math.max(1, totalSteps - 1)) * graphW;
  }
  function yFor(level) {
    return top + graphH - (Math.min(level, maxLevel) / maxLevel) * graphH;
  }

  ctx.clearRect(0, 0, w, h);

  // grid lines + numbers on the side
  ctx.font = "11px sans-serif";
  ctx.fillStyle = colors.muted;
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  ctx.textAlign = "right";
  const gap = Math.ceil(maxLevel / 5);
  for (let level = 0; level <= maxLevel; level += gap) {
    ctx.beginPath();
    ctx.moveTo(left, yFor(level));
    ctx.lineTo(w - right, yFor(level));
    ctx.stroke();
    ctx.fillText(String(level), left - 6, yFor(level) + 4);
  }
  ctx.textAlign = "left";
  ctx.fillText("time →", left, h - 5);

  if (points.length === 0) {
    ctx.textAlign = "center";
    ctx.font = "13px sans-serif";
    ctx.fillText("Run your code to draw its sound", w / 2, h / 2);
    return;
  }

  // blue while playing, then green if it worked or red if it didn't
  let color = colors.accent;
  if (ending) color = ending.tone === "ok" ? colors.ok : colors.err;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";

  // calls/returns are joined into a line, loop ticks are little bars
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.sound === "tick") {
      ctx.fillRect(xFor(i) - 1.5, yFor(p.level) - 8, 3, 8);
    } else if (!started) {
      ctx.moveTo(xFor(i), yFor(p.level));
      started = true;
    } else {
      ctx.lineTo(xFor(i), yFor(p.level));
    }
  }
  ctx.stroke();

  // a dot on the newest point
  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(xFor(points.length - 1), yFor(last.level), 5, 0, Math.PI * 2);
  ctx.fill();

  // the result ("came back down ✓") in the top right corner
  if (ending && ending.label) {
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(ending.label, w - right, top + 22);
  }
}
