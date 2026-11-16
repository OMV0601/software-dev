// Visuals for sighted viewers (teachers, judges, the demo video).
// The product is the sound; these canvases just show what you are hearing.
//
//  SpaceView: a top-down view of your head. Each sound appears as a glowing
//             dot where it sits in 3D space (deeper code = further right).
//  PitchView: the pitch over time. Recursion that works looks like a
//             mountain (up, then back down); runaway recursion climbs forever.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function palette() {
  return {
    bg: css("--panel"),
    line: css("--line"),
    text: css("--text"),
    muted: css("--muted"),
    accent: css("--accent"),
    warm: css("--warm"),
    ok: css("--ok"),
    err: css("--err"),
  };
}

/** Make a canvas sharp on high-DPI screens and keep it sized to its box. */
function fitCanvas(canvas, onResize) {
  // Keep the aspect ratio from the width/height attributes in the HTML.
  const aspect = canvas.height / canvas.width;
  let lastW = 0;
  const resize = () => {
    const w = Math.round(canvas.clientWidth) || canvas.width;
    if (w === lastW) return;
    lastW = w;
    const h = Math.round(w * aspect);
    const ratio = window.devicePixelRatio || 1;
    canvas._w = w;
    canvas._h = h;
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    canvas.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
    onResize();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
}

// ------------------------------------------------------------------- space
const KIND_COLOR = {
  call: "accent", return: "accent", tick: "warm", edge: "muted",
  function: "accent", class: "accent", for: "warm", while: "warm",
  if: "ok", elif: "ok", else: "ok", try: "ok", except: "ok", finally: "ok",
  error: "err", done: "ok",
};

export class SpaceView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.pings = [];
    this.colors = palette();
    fitCanvas(canvas, () => this.draw());
    const loop = () => {
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Show a sound at a 3D position. */
  ping({ pos, kind = "call", label = "" }) {
    this.pings.push({ pos, kind, label, born: performance.now() });
    if (this.pings.length > 40) this.pings.shift();
  }

  layout() {
    const w = this.canvas._w, h = this.canvas._h;
    const head = { x: w * 0.2, y: h * 0.62, r: Math.min(w, h) * 0.085 };
    const unit = (w * 0.74) / 3.6; // x = 0 .. 3.6 (depth 0 .. 8) spans the width
    return { w, h, head, unit };
  }

  toCanvas(pos, { head, unit }) {
    return { x: head.x + pos.x * unit, y: head.y + pos.z * unit * 0.85 - pos.y * unit * 0.4 };
  }

  draw() {
    const { ctx } = this;
    const c = this.colors;
    const L = this.layout();
    const { w, h, head, unit } = L;
    ctx.clearRect(0, 0, w, h);

    // depth guide columns
    ctx.font = "11px " + css("--sans");
    ctx.textAlign = "center";
    for (let d = 0; d <= 8; d++) {
      const x = head.x + d * 0.45 * unit;
      ctx.strokeStyle = c.line;
      ctx.globalAlpha = d === 0 ? 0.9 : 0.5;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x, h - 18);
      ctx.stroke();
      ctx.setLineDash([]);
      {
        ctx.fillStyle = c.muted;
        ctx.fillText(d === 0 ? "depth 0" : String(d), x, h - 4);
      }
    }
    ctx.globalAlpha = 1;

    // listener's head (top-down): circle, nose pointing forward (up), ears
    ctx.fillStyle = c.bg;
    ctx.strokeStyle = c.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(head.x, head.y, head.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(head.x - head.r * 0.28, head.y - head.r * 0.92);
    ctx.lineTo(head.x, head.y - head.r * 1.32);
    ctx.lineTo(head.x + head.r * 0.28, head.y - head.r * 0.92);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(head.x + side * head.r, head.y, head.r * 0.18, head.r * 0.34, 0, 0, Math.PI * 2);
      ctx.fillStyle = c.text;
      ctx.fill();
    }
    ctx.fillStyle = c.muted;
    ctx.fillText("L", head.x - head.r * 1.7, head.y + 4);
    ctx.fillText("R", head.x + head.r * 1.7, head.y + 4);
    ctx.fillText("you", head.x, head.y + head.r + 16);

    // sound pings: a dot with an expanding ring that fades out
    const now = performance.now();
    this.pings = this.pings.filter((p) => now - p.born < 1600);
    const newest = this.pings[this.pings.length - 1];
    for (const p of this.pings) {
      const age = (now - p.born) / 1600;
      const { x, y } = this.toCanvas(p.pos, L);
      const color = c[KIND_COLOR[p.kind] || "accent"];
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 8 + age * 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      // faint line from the head to the sound
      ctx.globalAlpha = Math.max(0, 0.35 - age * 0.35);
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (p.label && p === newest && age < 0.9) {
        ctx.globalAlpha = Math.min(1, 1.6 - age * 1.6);
        ctx.fillStyle = c.text;
        ctx.font = "600 13px " + css("--mono");
        ctx.textAlign = "center";
        const half = ctx.measureText(p.label).width / 2 + 4;
        ctx.fillText(p.label, Math.max(half, Math.min(x, w - half)), y - 18);
        ctx.font = "11px " + css("--sans");
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------- pitch
export class PitchView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.colors = palette();
    this.reset();
    fitCanvas(canvas, () => this.draw());
  }

  reset(score = null) {
    this.points = [];
    this.total = score ? Math.max(score.steps.length, 10) : 10;
    this.maxLevel = score ? Math.max(6, ...score.steps.map((s) => s.level + 1)) : 6;
    this.maxLevel = Math.min(this.maxLevel, 24); // same cap as the audio pitch
    this.ending = null;
    this.truncated = score ? score.truncated : false;
    this.draw();
  }

  add(step) {
    this.points.push(step);
    this.draw();
  }

  end(tone, label) {
    this.ending = { tone, label };
    this.draw();
  }

  draw() {
    const { ctx } = this;
    const c = this.colors;
    const w = this.canvas._w, h = this.canvas._h;
    if (!w) return;
    const pad = { l: 30, r: 16, t: 14, b: 22 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const X = (i) => pad.l + (i / Math.max(1, this.total - 1)) * pw;
    const Y = (level) => pad.t + ph - (Math.min(level, this.maxLevel) / this.maxLevel) * ph;

    ctx.clearRect(0, 0, w, h);
    ctx.font = "11px " + css("--sans");
    ctx.fillStyle = c.muted;
    ctx.textAlign = "right";
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    for (let l = 0; l <= this.maxLevel; l += Math.ceil(this.maxLevel / 5)) {
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(l));
      ctx.lineTo(w - pad.r, Y(l));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(String(l), pad.l - 6, Y(l) + 4);
    }
    ctx.textAlign = "left";
    ctx.fillText("time →", pad.l, h - 5);

    if (!this.points.length) {
      ctx.fillStyle = c.muted;
      ctx.textAlign = "center";
      ctx.font = "13px " + css("--sans");
      ctx.fillText("Run your code to draw its sound", w / 2, h / 2);
      return;
    }

    const color = this.ending ? (this.ending.tone === "ok" ? c.ok : c.err) : c.accent;

    // loop ticks as small bars, calls/returns as a staircase line
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let started = false;
    this.points.forEach((p, i) => {
      if (p.sound === "tick") {
        ctx.fillRect(X(i) - 1.5, Y(p.level) - 8, 3, 8);
        return;
      }
      const x = X(i), y = Y(p.level);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // current point
    const last = this.points[this.points.length - 1];
    const lx = X(this.points.length - 1), ly = Y(last.level);
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fill();

    // Result badge in the top-right corner, clear of the line.
    if (this.ending && this.ending.label) {
      ctx.font = "700 14px " + css("--sans");
      ctx.textAlign = "right";
      ctx.fillText(this.ending.label, w - pad.r, pad.t + 22);
    }
  }
}
