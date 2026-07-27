// Audio cues: synthesis and the note vocabulary they are built from.
// Scheduling them against the playhead lives in pages/abs-timer.js.
const CUE_HORIZON = 90; // seconds of audio cues queued ahead of the playhead

// Cues are queued on the Web Audio clock, which is sample-accurate and keeps
// running independently of JS timers. Firing them from the tick instead made
// the "3 · 2 · 1 · GO" spacing follow whenever React happened to re-render.
const AUDIO = { ctx: null, master: null };

const audioCtx = () => {
  try {
    if (!AUDIO.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      AUDIO.ctx = new AC();
      AUDIO.master = AUDIO.ctx.createGain();
      AUDIO.master.gain.value = 1;
      // Safety limiter. Cues overlap notes, so peaks stack; this lets each one
      // sit as loud as it needs to without a stray sum clipping into a crackle.
      const limiter = AUDIO.ctx.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.knee.value = 3;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.15;
      AUDIO.master.connect(limiter);
      limiter.connect(AUDIO.ctx.destination);
    }
    if (AUDIO.ctx.state === "suspended") AUDIO.ctx.resume().catch(() => {});
    return AUDIO.ctx;
  } catch (e) {
    return null; // audio unavailable
  }
};

// One struck note, built additively from sine partials. A few harmonics give
// it enough body to carry on a phone speaker; a square wave carries too, but
// its odd-harmonic stack up past 5kHz is what makes a beep sound harsh.
//
// The envelope matters as much as the level: ramping straight down from peak
// leaves a long note sitting near silence for most of its length, which is why
// the drawn-out "GO" used to read as quieter than the short ticks before it.
// Struck attack → decay → held tail → soft release keeps the energy up while
// still sounding plucked rather than blown.
const tone = (ctx, at, spec) => {
  const dur = spec.dur;
  const peak = spec.gain;
  const attack = Math.min(spec.attack == null ? 0.014 : spec.attack, dur / 4);
  const decay = Math.min(0.12, dur / 3);
  const tail = Math.max(0.0002, (spec.sustain == null ? 0.5 : spec.sustain) * peak);
  const release = Math.min(0.16, dur / 2.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(tail, at + attack + decay);
  g.gain.setValueAtTime(tail, at + dur - release);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(AUDIO.master);
  const oscs = [];
  (spec.partials || [1, 0.26, 0.08]).forEach((amp, k) => {
    if (!amp) return;
    const osc = ctx.createOscillator();
    const pg = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(spec.freq * (k + 1), at);
    pg.gain.value = amp;
    osc.connect(pg);
    pg.connect(g);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    oscs.push(osc);
  });
  return oscs;
};

// Everything is tuned to an A major triad (A5 880 · C#6 1109 · E6 1319), so the
// ticks and the cue they resolve into belong to the same chord instead of just
// being loud noises at each other.
const A4 = 440;
const CS5 = 554.37;
const E5 = 659.25;
const A5 = 880;
const CS6 = 1108.73;
const E6 = 1318.51;
const A6 = 1760;

const CUES = {
  // countdown tick — a soft mallet on A5: quick decay, no ring, easy to hear
  // three times in a row without getting shrill
  count: [{ at: 0, freq: A5, dur: 0.24, gain: 0.36, sustain: 0.3, partials: [1, 0.2, 0.05] }],
  // "GO" — the one that kept getting lost. Two grace notes rising into a
  // sustained A major chime: longer and fuller than a tick, and resolved rather
  // than piercing. The held tail is what carries it, not the attack.
  go: [
    { at: 0, freq: A5, dur: 0.11, gain: 0.28, sustain: 0.4 },
    { at: 0.085, freq: CS6, dur: 0.11, gain: 0.3, sustain: 0.4 },
    { at: 0.17, freq: E6, dur: 0.95, gain: 0.3, sustain: 0.62, partials: [1, 0.22, 0.07] },
    { at: 0.17, freq: A5, dur: 0.95, gain: 0.24, sustain: 0.62 },
    { at: 0.17, freq: A4, dur: 1.05, gain: 0.18, sustain: 0.55, partials: [1, 0.3, 0.12] },
    { at: 0.17, freq: A6, dur: 0.6, gain: 0.09, sustain: 0.4, partials: [1] },
  ],
  // into a rest — the same chord falling instead of rising, deliberately
  // warmer and quieter than "go" so the two are never confused
  rest: [
    { at: 0, freq: E5, dur: 0.18, gain: 0.22, sustain: 0.35 },
    { at: 0.15, freq: A4, dur: 0.6, gain: 0.24, sustain: 0.45, partials: [1, 0.3, 0.1] },
  ],
  // finished — the arpeggio walked all the way up, left ringing
  done: [
    { at: 0, freq: A4, dur: 0.17, gain: 0.24, sustain: 0.35 },
    { at: 0.15, freq: CS5, dur: 0.17, gain: 0.24, sustain: 0.35 },
    { at: 0.3, freq: E5, dur: 0.17, gain: 0.24, sustain: 0.35 },
    { at: 0.45, freq: A5, dur: 1.35, gain: 0.28, sustain: 0.6, partials: [1, 0.24, 0.08] },
    { at: 0.45, freq: CS6, dur: 1.2, gain: 0.15, sustain: 0.55 },
    { at: 0.45, freq: E6, dur: 1.2, gain: 0.13, sustain: 0.55 },
    { at: 0.45, freq: A4, dur: 1.45, gain: 0.18, sustain: 0.55, partials: [1, 0.3, 0.12] },
  ],
};

// Returns the created oscillators so a pause/skip can cancel what is still pending.
const playCue = (ctx, name, at) => {
  const parts = CUES[name];
  if (!parts) return [];
  const nodes = [];
  parts.forEach((p) => {
    try {
      nodes.push.apply(nodes, tone(ctx, at + p.at, p));
    } catch (e) {
      /* node limit / context closed */
    }
  });
  return nodes;
};
