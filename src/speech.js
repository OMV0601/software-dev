// Voice output using the browser's built-in speech (Web Speech API).
//
// - Instant and offline: no network, no API keys.
// - New speech interrupts old speech, so the voice never lags behind the keys.
// - Everything spoken is also written to an ARIA live region, so people who
//   use their own screen reader (NVDA, JAWS, VoiceOver) get the same text.

import { speakText } from "./speakable.js";

export class Speech {
  constructor({ liveRegion, onSay = () => {} } = {}) {
    this.live = liveRegion;
    this.onSay = onSay;
    this.rate = 1.3;
    this.enabled = true;
    this.last = null;
    this.voice = null;
    this.synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (this.synth) {
      const pick = () => {
        const voices = this.synth.getVoices();
        this.voice =
          voices.find((v) => /en[-_]US/i.test(v.lang) && v.localService) ||
          voices.find((v) => /^en/i.test(v.lang)) ||
          null;
      };
      pick();
      this.synth.addEventListener?.("voiceschanged", pick);
    }
  }

  /**
   * @param {string} text  may contain `code in backticks`
   * @param {{tone?: string, interrupt?: boolean, remember?: boolean}} opts
   */
  say(text, { tone = "info", interrupt = true, remember = true } = {}) {
    const spoken = speakText(text);
    if (remember) this.last = { text, tone };
    this.onSay(text, tone);
    if (this.live) {
      // Clearing first makes screen readers announce repeated messages too.
      this.live.textContent = "";
      setTimeout(() => (this.live.textContent = spoken), 30);
    }
    if (!this.enabled || !this.synth) return;
    if (interrupt) this.synth.cancel();
    const u = new SpeechSynthesisUtterance(spoken);
    u.rate = this.rate;
    if (this.voice) u.voice = this.voice;
    this.synth.speak(u);
  }

  repeat() {
    if (this.last) this.say(this.last.text, { tone: this.last.tone });
    else this.say("Nothing to repeat yet.");
  }

  stop() {
    this.synth?.cancel();
  }
}
