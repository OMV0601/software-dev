// The voice. Uses the browser's built-in text-to-speech (speechSynthesis),
// so it's instant, free and works offline.
//
// Everything we say also goes into a hidden "live region" on the page.
// Screen readers (like NVDA or VoiceOver) read live regions out loud too,
// so people using their own screen reader get the same messages.

import { speakText } from "./speakable.js";

let liveRegion = null;
let showCaption = null;
let voiceSpeed = 1.3;
let lastMessage = null;
let chosenVoice = null;
let voiceOn = true; // people who already use a screen reader can turn our voice off

export function setupSpeech(region, captionFunction) {
  liveRegion = region;
  showCaption = captionFunction;
  if (window.speechSynthesis) {
    pickVoice();
    // some browsers load their voices late, so try again when they arrive
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  chosenVoice = null;
  // prefer an American English voice that's installed on the computer
  for (const voice of voices) {
    if ((voice.lang === "en-US" || voice.lang === "en_US") && voice.localService) {
      chosenVoice = voice;
      return;
    }
  }
  for (const voice of voices) {
    if (voice.lang.startsWith("en")) {
      chosenVoice = voice;
      return;
    }
  }
}

// text can have `code in backticks`. The caption shows it as code,
// and the voice reads it in a friendly way (see speakable.js)
export function say(text, tone = "info") {
  const spoken = speakText(text);
  lastMessage = { text: text, tone: tone };
  if (showCaption) showCaption(text, tone);

  if (liveRegion) {
    // empty it first, otherwise screen readers skip a message that's the same as the last one
    liveRegion.textContent = "";
    setTimeout(function () { liveRegion.textContent = spoken; }, 30);
  }

  if (!voiceOn || !window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // stop whatever it was saying before
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.rate = voiceSpeed;
  if (chosenVoice) utterance.voice = chosenVoice;
  window.speechSynthesis.speak(utterance);
}

export function repeatLast() {
  if (lastMessage) say(lastMessage.text, lastMessage.tone);
  else say("Nothing to repeat yet.");
}

export function stopTalking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

export function setVoiceSpeed(speed) {
  voiceSpeed = speed;
}

// when the voice is off, messages still go to the screen reader (live region) and captions
export function setVoiceOn(on) {
  voiceOn = on;
  if (!on) stopTalking();
}

export function isVoiceOn() {
  return voiceOn;
}
