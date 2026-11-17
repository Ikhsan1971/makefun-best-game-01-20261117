// Web Audio, synthesized in code: no audio files anywhere. Every effect is a few oscillators
// and one filtered noise burst. The engine is two detuned oscillators through a lowpass that
// opens with the difficulty level. Everything is a silent no-op until the first user gesture
// (browsers keep AudioContext suspended before that), and survives audio being unavailable.

export function createAudio() {
  let context = null;
  let master = null;
  let engine = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return false;
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
    } catch {
      context = null;
      return false;
    }
    return true;
  }

  function now() {
    return context ? context.currentTime : 0;
  }

  function tone(frequency, { type = 'sine', duration = 0.18, volume = 0.5, slideTo = 0, delay = 0 } = {}) {
    if (!ensure() || muted) return;
    const start = now() + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function noise({ duration = 0.3, volume = 0.6, delay = 0, lowpass = 900 } = {}) {
    if (!ensure() || muted) return;
    const start = now() + delay;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
  }

  function engineStart() {
    if (!ensure() || engine) return;
    const oscA = context.createOscillator();
    const oscB = context.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'square';
    oscA.frequency.value = 54;
    oscB.frequency.value = 108.5;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 9;
    const gain = context.createGain();
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.16, now() + 0.4);
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain).connect(master);
    oscA.start();
    oscB.start();
    engine = { oscA, oscB, filter, gain };
  }

  function engineLevel(level) {
    if (!engine) return;
    const base = 50 + level * 9;
    engine.oscA.frequency.setTargetAtTime(base, now(), 0.25);
    engine.oscB.frequency.setTargetAtTime(base * 2.02, now(), 0.25);
    engine.filter.frequency.setTargetAtTime(300 + level * 150, now(), 0.25);
  }

  function engineStop() {
    if (!engine) return;
    const { oscA, oscB, gain } = engine;
    gain.gain.setTargetAtTime(0.0001, now(), 0.2);
    const stopAt = now() + 0.8;
    try {
      oscA.stop(stopAt);
      oscB.stop(stopAt);
    } catch {
      // Already stopped.
    }
    engine = null;
  }

  return {
    ensure,
    engineStart,
    engineLevel,
    engineStop,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.32;
      return muted;
    },
    start() {
      tone(392, { type: 'square', duration: 0.12, volume: 0.35 });
      tone(587, { type: 'square', duration: 0.14, volume: 0.35, delay: 0.1 });
      tone(784, { type: 'square', duration: 0.22, volume: 0.4, delay: 0.2 });
    },
    uiMove() { tone(660, { type: 'sine', duration: 0.06, volume: 0.2 }); },
    pickup() {
      tone(880, { type: 'sine', duration: 0.09, volume: 0.4 });
      tone(1318, { type: 'sine', duration: 0.16, volume: 0.4, delay: 0.06 });
    },
    comboUp(tier) {
      const base = 660 * (1 + tier * 0.12);
      tone(base, { type: 'triangle', duration: 0.08, volume: 0.35 });
      tone(base * 1.5, { type: 'triangle', duration: 0.14, volume: 0.35, delay: 0.05 });
    },
    pod() {
      tone(523, { type: 'square', duration: 0.12, volume: 0.35 });
      tone(659, { type: 'square', duration: 0.12, volume: 0.35, delay: 0.09 });
      tone(880, { type: 'square', duration: 0.2, volume: 0.38, delay: 0.18 });
      tone(1046, { type: 'sine', duration: 0.3, volume: 0.3, delay: 0.27 });
    },
    repair() {
      tone(520, { type: 'triangle', duration: 0.12, volume: 0.4 });
      tone(392, { type: 'triangle', duration: 0.18, volume: 0.35, delay: 0.1 });
    },
    hit() {
      noise({ duration: 0.34, volume: 0.7, lowpass: 700 });
      tone(92, { type: 'sawtooth', duration: 0.4, volume: 0.55, slideTo: 46 });
    },
    timeWarn() { tone(988, { type: 'square', duration: 0.08, volume: 0.3 }); },
    over() {
      tone(392, { type: 'sawtooth', duration: 0.3, volume: 0.4, slideTo: 311 });
      tone(311, { type: 'sawtooth', duration: 0.3, volume: 0.4, slideTo: 233, delay: 0.25 });
      tone(233, { type: 'sawtooth', duration: 0.55, volume: 0.42, slideTo: 155, delay: 0.5 });
      noise({ duration: 0.5, volume: 0.3, delay: 0.1, lowpass: 500 });
    },
    timeUp() {
      tone(784, { type: 'square', duration: 0.16, volume: 0.4 });
      tone(784, { type: 'square', duration: 0.16, volume: 0.35, delay: 0.18 });
      tone(1175, { type: 'square', duration: 0.4, volume: 0.42, delay: 0.36 });
    },
  };
}
