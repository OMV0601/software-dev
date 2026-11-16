// Web Audio engine. Makes every EchoCode sound from scratch with oscillators,
// so there are no audio files to load and nothing can fail to download.
//
// 3D sound: every sound goes through a PannerNode using "HRTF", a model of how
// your head and ears change a sound depending on where it comes from. With
// headphones, a sound at x = +1 really feels like it is on your right.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.playback = null;
  }

  /** Browsers only allow audio after a key press or click, so call this then. */
  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const l = this.ctx.listener;
      // Listener at the centre, facing forward (-z), head up (+y).
      if (l.forwardZ) {
        l.positionX.value = 0; l.positionY.value = 0; l.positionZ.value = 0;
        l.forwardX.value = 0; l.forwardY.value = 0; l.forwardZ.value = -1;
        l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  get now() {
    return this.ensure().currentTime;
  }

  // ---------------------------------------------------------------- routing
  panner(pos = { x: 0, y: 0, z: -1 }, out = this.master) {
    const p = this.ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 1;
    p.rolloffFactor = 0.4;
    if (p.positionX) {
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    } else {
      p.setPosition(pos.x, pos.y, pos.z);
    }
    p.connect(out);
    return p;
  }

  envelope(t, { attack = 0.005, peak = 0.5, decay = 0.25 } = {}, out) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
  }

  osc(type, freq, t, dur, out, { glideTo } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // ---------------------------------------------------------------- sounds
  /** Plucked note: used for calls (going up) and returns (coming down). */
  note(freq, t, pos, { peak = 0.45, decay = 0.32, out = this.master } = {}) {
    const p = this.panner(pos, out);
    const g = this.envelope(t, { peak, decay }, p);
    this.osc("triangle", freq, t, decay, g);
    const g2 = this.envelope(t, { peak: peak * 0.25, decay: decay * 0.6 }, p);
    this.osc("sine", freq * 2, t, decay, g2);
  }

  /** Short percussive click: one loop iteration. */
  tick(t, pos, { freq = 1800, out = this.master } = {}) {
    const p = this.panner(pos, out);
    const g = this.envelope(t, { attack: 0.002, peak: 0.35, decay: 0.05 }, p);
    this.osc("square", freq, t, 0.05, g, { glideTo: freq * 0.5 });
  }

  /** Low, rough buzz: something went wrong. */
  buzz(t, { out = this.master } = {}) {
    const p = this.panner({ x: 0, y: 0, z: -1 }, out);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.connect(p);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.setValueAtTime(0.5, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    g.connect(lp);
    this.osc("sawtooth", 82, t, 0.7, g);
    this.osc("sawtooth", 87, t, 0.7, g);
  }

  /** Bright rising arpeggio: finished cleanly. */
  chime(t, { out = this.master } = {}) {
    const p = this.panner({ x: 0, y: 0.3, z: -1 }, out);
    [784, 988, 1175, 1568].forEach((f, i) => {
      const g = this.envelope(t + i * 0.07, { peak: 0.3, decay: 0.9 }, p);
      this.osc("sine", f, t + i * 0.07, 0.9, g);
      const g2 = this.envelope(t + i * 0.07, { peak: 0.06, decay: 0.5 }, p);
      this.osc("sine", f * 2.76, t + i * 0.07, 0.5, g2); // bell-like overtone
    });
  }

  /** Soft bell: a simple statement (used by Explore mode). */
  bell(freq, t, pos, { out = this.master } = {}) {
    const p = this.panner(pos, out);
    const g = this.envelope(t, { peak: 0.32, decay: 0.5 }, p);
    this.osc("sine", freq, t, 0.5, g);
    const g2 = this.envelope(t, { peak: 0.08, decay: 0.3 }, p);
    this.osc("sine", freq * 2.76, t, 0.3, g2);
  }

  /** Three-note chord: a function definition. */
  chord(freq, t, pos, { out = this.master } = {}) {
    const p = this.panner(pos, out);
    [1, 1.25, 1.5].forEach((ratio) => {
      const g = this.envelope(t, { peak: 0.18, decay: 0.6 }, p);
      this.osc("triangle", freq * ratio, t, 0.6, g);
    });
  }

  /** Low drum hit: a loop header (Explore mode). */
  drum(t, pos, { out = this.master } = {}) {
    const p = this.panner(pos, out);
    const g = this.envelope(t, { attack: 0.003, peak: 0.7, decay: 0.25 }, p);
    this.osc("sine", 160, t, 0.25, g, { glideTo: 50 });
  }

  /** Two-note "question" interval: an if / elif / else branch (Explore mode). */
  branch(freq, t, pos, { out = this.master } = {}) {
    this.bell(freq, t, pos, { out });
    this.bell(freq * 1.5, t + 0.09, pos, { out });
  }

  /** Dull thud: you hit the edge (no more blocks in that direction). */
  thud(t, { out = this.master } = {}) {
    const p = this.panner({ x: 0, y: -0.3, z: -1 }, out);
    const g = this.envelope(t, { attack: 0.003, peak: 0.4, decay: 0.12 }, p);
    this.osc("sine", 110, t, 0.12, g, { glideTo: 70 });
  }

  // ---------------------------------------------------------------- playback
  /**
   * Play a score from sonify.buildScore(). Sounds are scheduled on the audio
   * clock (sample-accurate), and onStep fires in sync for the visuals.
   */
  play(score, { onStep = () => {}, onEnd = () => {} } = {}) {
    this.stop();
    const ctx = this.ensure();
    const bus = ctx.createGain();
    bus.connect(this.master);
    const start = ctx.currentTime + 0.08;
    const timers = [];

    for (const s of score.steps) {
      const t = start + s.t;
      if (s.sound === "call") this.note(s.freq, t, s.pos, { out: bus });
      else if (s.sound === "return") this.note(s.freq, t, s.pos, { peak: 0.3, decay: 0.22, out: bus });
      else if (s.sound === "tick") this.tick(t, s.pos, { freq: 1500 + 120 * s.level, out: bus });
      timers.push(setTimeout(() => onStep(s), (t - ctx.currentTime) * 1000));
    }

    const endT = start + score.endAt;
    if (score.ending === "chime") this.chime(endT, { out: bus });
    else this.buzz(endT, { out: bus });

    let finish;
    const done = new Promise((resolve) => (finish = resolve));
    timers.push(setTimeout(() => {
      onEnd(score.ending);
      finish(true);
    }, (endT - ctx.currentTime) * 1000 + 250));

    this.playback = { bus, timers, finish };
    return done;
  }

  /** Stop the current playback immediately (with a tiny fade to avoid clicks). */
  stop() {
    if (!this.playback) return;
    const { bus, timers, finish } = this.playback;
    timers.forEach(clearTimeout);
    const t = this.ctx.currentTime;
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + 0.05);
    setTimeout(() => bus.disconnect(), 100);
    finish(false);
    this.playback = null;
  }

  get playing() {
    return this.playback != null;
  }
}
