// All the sounds. They're made with the Web Audio API using oscillators
// (basic wave shapes), so there are no sound files to download.
//
// 3D sound: every sound goes through a "panner" set to HRTF mode. HRTF copies
// how your ears hear things from different directions, so with headphones
// a sound at x = 1 really sounds like it's on your right.

let audioCtx = null;
let masterVolume = null;
let playback = null; // the score that is playing right now (so we can stop it)

// Browsers only let you start audio after a key press or click,
// so this gets called from the Run key / Explore key.
export function startAudio() {
  if (audioCtx === null) {
    audioCtx = new AudioContext();
    masterVolume = audioCtx.createGain();
    masterVolume.gain.value = 0.8;
    // the compressor stops it getting too loud when lots of sounds overlap
    const compressor = audioCtx.createDynamicsCompressor();
    masterVolume.connect(compressor);
    compressor.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

export function getTime() {
  startAudio();
  return audioCtx.currentTime;
}

// ---------- building blocks ----------

// puts a sound at a position around your head
function makePanner(pos, output) {
  const panner = audioCtx.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.rolloffFactor = 0.4;
  panner.positionX.value = pos.x;
  panner.positionY.value = pos.y;
  panner.positionZ.value = pos.z;
  panner.connect(output);
  return panner;
}

// makes the volume go up fast then fade out (like plucking a string)
function makeEnvelope(start, peak, attack, fade, output) {
  const volume = audioCtx.createGain();
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(peak, start + attack);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + attack + fade);
  volume.connect(output);
  return volume;
}

// makes a tone. type is "sine", "triangle", "square" or "sawtooth"
function makeTone(type, freq, start, length, output, endFreq) {
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + length);
  osc.connect(output);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

// ---------- the actual sounds ----------

// a plucked note, used for function calls and returns
export function playNote(freq, time, pos, loudness = 0.45, length = 0.32, output = masterVolume) {
  const panner = makePanner(pos, output);
  makeTone("triangle", freq, time, length, makeEnvelope(time, loudness, 0.005, length, panner));
  // a quieter note one octave up makes it sound richer
  makeTone("sine", freq * 2, time, length, makeEnvelope(time, loudness * 0.25, 0.005, length * 0.6, panner));
}

// a short click = one time round a loop
export function playTick(time, pos, freq = 1800, output = masterVolume) {
  const panner = makePanner(pos, output);
  makeTone("square", freq, time, 0.05, makeEnvelope(time, 0.35, 0.002, 0.05, panner), freq * 0.5);
}

// a low rough buzz = something went wrong
export function playBuzz(time, output = masterVolume) {
  const panner = makePanner({ x: 0, y: 0, z: -1 }, output);
  const filter = audioCtx.createBiquadFilter(); // cuts the harsh high part
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.connect(panner);
  const volume = audioCtx.createGain();
  volume.gain.setValueAtTime(0.0001, time);
  volume.gain.exponentialRampToValueAtTime(0.5, time + 0.02);
  volume.gain.setValueAtTime(0.5, time + 0.45);
  volume.gain.exponentialRampToValueAtTime(0.0001, time + 0.7);
  volume.connect(filter);
  // two notes very close together "wobble", which sounds like a buzzer
  makeTone("sawtooth", 82, time, 0.7, volume);
  makeTone("sawtooth", 87, time, 0.7, volume);
}

// 4 rising bell notes = finished with no problems
export function playChime(time, output = masterVolume) {
  const panner = makePanner({ x: 0, y: 0.3, z: -1 }, output);
  const notes = [784, 988, 1175, 1568];
  for (let i = 0; i < notes.length; i++) {
    const start = time + i * 0.07;
    makeTone("sine", notes[i], start, 0.9, makeEnvelope(start, 0.3, 0.005, 0.9, panner));
    // 2.76x the frequency is what makes it sound like a bell
    makeTone("sine", notes[i] * 2.76, start, 0.5, makeEnvelope(start, 0.06, 0.005, 0.5, panner));
  }
}

// soft bell = a normal line (Explore mode)
export function playBell(freq, time, pos, output = masterVolume) {
  const panner = makePanner(pos, output);
  makeTone("sine", freq, time, 0.5, makeEnvelope(time, 0.32, 0.005, 0.5, panner));
  makeTone("sine", freq * 2.76, time, 0.3, makeEnvelope(time, 0.08, 0.005, 0.3, panner));
}

// 3 notes at once = a function (Explore mode)
export function playChord(freq, time, pos, output = masterVolume) {
  const panner = makePanner(pos, output);
  const ratios = [1, 1.25, 1.5]; // a major chord
  for (const ratio of ratios) {
    makeTone("triangle", freq * ratio, time, 0.6, makeEnvelope(time, 0.18, 0.005, 0.6, panner));
  }
}

// a drum hit = a loop (Explore mode)
export function playDrum(time, pos, output = masterVolume) {
  const panner = makePanner(pos, output);
  makeTone("sine", 160, time, 0.25, makeEnvelope(time, 0.7, 0.003, 0.25, panner), 50);
}

// two bells going up, like a question = if / elif / else (Explore mode)
export function playBranch(freq, time, pos, output = masterVolume) {
  playBell(freq, time, pos, output);
  playBell(freq * 1.5, time + 0.09, pos, output);
}

// a dull thud = you hit the edge (nothing more that way)
export function playThud(time, output = masterVolume) {
  const panner = makePanner({ x: 0, y: -0.3, z: -1 }, output);
  makeTone("sine", 110, time, 0.12, makeEnvelope(time, 0.4, 0.003, 0.12, panner), 70);
}

// ---------- playing a whole run ----------

// Plays a score from sonify.js. All the sounds are scheduled on the audio
// clock up front, so the rhythm is perfect. onStep gets called at the same
// time as each sound so the visuals can keep up.
// Returns a promise: true if it finished, false if it was stopped.
export function playScore(score, onStep) {
  stopSound();
  startAudio();
  // everything goes through this so we can turn it all off at once
  const bus = audioCtx.createGain();
  bus.connect(masterVolume);
  const start = audioCtx.currentTime + 0.08;
  const timers = [];

  for (const step of score.steps) {
    const time = start + step.t;
    if (step.sound === "call") {
      playNote(step.freq, time, step.pos, 0.45, 0.32, bus);
    } else if (step.sound === "return") {
      playNote(step.freq, time, step.pos, 0.3, 0.22, bus); // a bit softer going down
    } else if (step.sound === "tick") {
      playTick(time, step.pos, 1500 + 120 * step.level, bus);
    }
    const msUntil = (time - audioCtx.currentTime) * 1000;
    timers.push(setTimeout(function () { onStep(step); }, msUntil));
  }

  const endTime = start + score.endAt;
  if (score.ending === "chime") playChime(endTime, bus);
  else playBuzz(endTime, bus);

  return new Promise(function (resolve) {
    const msUntilEnd = (endTime - audioCtx.currentTime) * 1000 + 250;
    timers.push(setTimeout(function () {
      playback = null;
      resolve(true);
    }, msUntilEnd));
    playback = { bus: bus, timers: timers, resolve: resolve };
  });
}

export function stopSound() {
  if (playback === null) return;
  for (const timer of playback.timers) clearTimeout(timer);
  // fade out really fast instead of cutting off (cutting off makes a click)
  const now = audioCtx.currentTime;
  playback.bus.gain.setValueAtTime(playback.bus.gain.value, now);
  playback.bus.gain.linearRampToValueAtTime(0, now + 0.05);
  const oldBus = playback.bus;
  setTimeout(function () { oldBus.disconnect(); }, 100);
  playback.resolve(false);
  playback = null;
}

export function isPlaying() {
  return playback !== null;
}
