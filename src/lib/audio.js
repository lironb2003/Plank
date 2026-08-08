// Audio cues: synthesis, the note vocabulary they are built from, and the
// packs the user picks between. Scheduling them against the playhead lives in
// pages/workout-timer.js.
const CUE_HORIZON = 90; // seconds of audio cues queued ahead of the playhead

// Cues are queued on the Web Audio clock, which is sample-accurate and keeps
// running independently of JS timers. Firing them from the tick instead made
// the "3 · 2 · 1 · GO" spacing follow whenever React happened to re-render.
const AUDIO = { ctx: null, master: null };

const DEFAULT_VOLUME = 0.8; // leaves headroom for the slider to go up, not just down
let masterVolume = DEFAULT_VOLUME;

const audioCtx = () => {
  try {
    if (!AUDIO.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      AUDIO.ctx = new AC();
      AUDIO.master = AUDIO.ctx.createGain();
      AUDIO.master.gain.value = masterVolume;
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

// Volume rides on the master gain, so dragging the slider mid-workout also
// changes cues that were already queued minutes ahead — no re-queue needed.
// The keep-alive loop deliberately bypasses this node: it has to keep playing
// at volume 0 or the tab loses its background-audio exemption.
const setMasterVolume = (v) => {
  masterVolume = Math.max(0, Math.min(1, v));
  try {
    if (AUDIO.master)
      AUDIO.master.gain.setTargetAtTime(masterVolume, AUDIO.ctx.currentTime, 0.02);
  } catch (e) {
    /* context closed */
  }
};

// One struck note, built additively from partials. A few of them give it enough
// body to carry on a phone speaker; a square wave carries too, but its
// odd-harmonic stack up past 5kHz is what makes a beep sound harsh.
//
// The envelope matters as much as the level: ramping straight down from peak
// leaves a long note sitting near silence for most of its length, which is why
// a drawn-out cue can read as quieter than the short ticks before it. Struck
// attack → decay → held tail → soft release keeps the energy up while still
// sounding plucked rather than blown.
//
// spec: { freq, dur, gain, at, sustain?, attack?, type?, partials?, ratios?,
//         bend?, bendTime? }
//   partials — amplitudes of the harmonic series (1×, 2×, 3× … the fundamental)
//   ratios   — [multiplier, amplitude] pairs, for the inharmonic stacks that
//              make a bell sound like metal and a knock sound like wood
//   bend     — glide the pitch to `bend` × freq over `bendTime`, which is what
//              turns a tone into a blip or a knock
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
  const parts = spec.ratios || (spec.partials || [1, 0.26, 0.08]).map((amp, k) => [k + 1, amp]);
  const oscs = [];
  parts.forEach((part) => {
    const mult = part[0];
    const amp = part[1];
    if (!amp) return;
    const osc = ctx.createOscillator();
    const pg = ctx.createGain();
    osc.type = spec.type || "sine";
    osc.frequency.setValueAtTime(spec.freq * mult, at);
    if (spec.bend)
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, spec.freq * mult * spec.bend),
        at + Math.min(spec.bendTime == null ? dur * 0.6 : spec.bendTime, dur)
      );
    pg.gain.value = amp;
    osc.connect(pg);
    pg.connect(g);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    oscs.push(osc);
  });
  return oscs;
};

// Pitches. The tuned packs stay inside A major, so the ticks and the cue they
// resolve into belong to the same chord instead of just being loud noises at
// each other.
const E4 = 329.63;
const A4 = 440;
const CS5 = 554.37;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;
const CS6 = 1108.73;
const E6 = 1318.51;
const A6 = 1760;

// Metal rings on partials that aren't whole multiples of the fundamental —
// that inharmonicity is the whole difference between "bell" and "beep".
const BELL_RATIOS = [
  [1, 1],
  [2.76, 0.42],
  [5.4, 0.16],
  [8.93, 0.07],
];
// A struck block is the same trick, tighter and with almost no tail.
const WOOD_RATIOS = [
  [1, 1],
  [2.7, 0.35],
  [4.3, 0.12],
];

// Each pack answers the same four moments: the 3·2·1 tick, starting an
// exercise, dropping into a rest, and finishing the workout. `blurb` is what
// the picker shows under the chips.
const CUE_PACKS = [
  {
    id: "mellow",
    name: "Mellow",
    blurb: "Soft wooden notes — a nudge, not an alarm.",
    cues: {
      count: [{ at: 0, freq: E5, dur: 0.15, gain: 0.3, sustain: 0.2, attack: 0.006, partials: [1, 0.18, 0.05] }],
      // Casual "ba-dum" — two warm notes stepping up, done in half a second.
      // Deliberately not a fanfare: it says "go" the way a person would.
      go: [
        { at: 0, freq: A4, dur: 0.13, gain: 0.3, sustain: 0.25, attack: 0.006, partials: [1, 0.22, 0.06] },
        { at: 0.1, freq: E5, dur: 0.55, gain: 0.34, sustain: 0.42, attack: 0.008, partials: [1, 0.2, 0.06] },
        { at: 0.1, freq: A5, dur: 0.4, gain: 0.09, sustain: 0.3, attack: 0.008, partials: [1] },
      ],
      rest: [
        { at: 0, freq: E5, dur: 0.14, gain: 0.22, sustain: 0.25, attack: 0.006 },
        { at: 0.11, freq: CS5, dur: 0.45, gain: 0.24, sustain: 0.4, partials: [1, 0.26, 0.08] },
      ],
      done: [
        { at: 0, freq: A4, dur: 0.16, gain: 0.24, sustain: 0.3, attack: 0.006 },
        { at: 0.14, freq: CS5, dur: 0.16, gain: 0.24, sustain: 0.3, attack: 0.006 },
        { at: 0.28, freq: E5, dur: 0.16, gain: 0.24, sustain: 0.3, attack: 0.006 },
        { at: 0.42, freq: A5, dur: 1.1, gain: 0.28, sustain: 0.5, partials: [1, 0.22, 0.07] },
        { at: 0.42, freq: A4, dur: 1.2, gain: 0.18, sustain: 0.45, partials: [1, 0.3, 0.12] },
      ],
    },
  },
  {
    id: "chime",
    name: "Chime",
    blurb: "Bright A-major bells. The original.",
    cues: {
      // countdown tick — a soft mallet on A5: quick decay, no ring, easy to hear
      // three times in a row without getting shrill
      count: [{ at: 0, freq: A5, dur: 0.24, gain: 0.36, sustain: 0.3, partials: [1, 0.2, 0.05] }],
      // Two grace notes rising into a sustained A major chime: longer and fuller
      // than a tick, and resolved rather than piercing. The held tail is what
      // carries it, not the attack.
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
    },
  },
  {
    id: "blips",
    name: "Blips",
    blurb: "Short digital pips. Cuts through a noisy gym.",
    cues: {
      count: [
        { at: 0, freq: G5, dur: 0.07, gain: 0.375, sustain: 0.9, attack: 0.003, type: "triangle", partials: [1] },
      ],
      // two pips and a quick upward swoop — over in a third of a second
      go: [
        { at: 0, freq: G5, dur: 0.07, gain: 0.35, sustain: 0.9, attack: 0.003, type: "triangle", partials: [1] },
        { at: 0.09, freq: C6, dur: 0.07, gain: 0.375, sustain: 0.9, attack: 0.003, type: "triangle", partials: [1] },
        {
          at: 0.18,
          freq: C6,
          dur: 0.24,
          gain: 0.375,
          sustain: 0.7,
          attack: 0.004,
          type: "triangle",
          partials: [1, 0.12],
          bend: 1.5,
          bendTime: 0.14,
        },
      ],
      rest: [
        { at: 0, freq: C6, dur: 0.07, gain: 0.3, sustain: 0.9, attack: 0.003, type: "triangle", partials: [1] },
        {
          at: 0.09,
          freq: G5,
          dur: 0.26,
          gain: 0.3,
          sustain: 0.6,
          attack: 0.004,
          type: "triangle",
          partials: [1, 0.12],
          bend: 0.67,
          bendTime: 0.18,
        },
      ],
      done: [
        { at: 0, freq: A4, dur: 0.07, gain: 0.325, sustain: 0.9, attack: 0.003, type: "triangle", partials: [1] },
        { at: 0.1, freq: E5, dur: 0.07, gain: 0.325, sustain: 0.9, attack: 0.003, type: "triangle", partials: [1] },
        { at: 0.2, freq: A5, dur: 0.07, gain: 0.325, sustain: 0.9, attack: 0.003, type: "triangle", partials: [1] },
        {
          at: 0.3,
          freq: A5,
          dur: 0.7,
          gain: 0.35,
          sustain: 0.65,
          attack: 0.004,
          type: "triangle",
          partials: [1, 0.14, 0.05],
          bend: 1.5,
          bendTime: 0.2,
        },
      ],
    },
  },
  {
    id: "wood",
    name: "Wood",
    blurb: "Dry knocks. Barely there until they aren't.",
    cues: {
      count: [
        { at: 0, freq: 900, dur: 0.08, gain: 0.45, sustain: 0.05, attack: 0.002, bend: 0.72, bendTime: 0.05, ratios: WOOD_RATIOS },
      ],
      // "tok — tok-TOK": a beat of space, then two knocks landing together
      go: [
        { at: 0, freq: 780, dur: 0.08, gain: 0.42, sustain: 0.05, attack: 0.002, bend: 0.72, bendTime: 0.05, ratios: WOOD_RATIOS },
        { at: 0.12, freq: 1150, dur: 0.09, gain: 0.51, sustain: 0.05, attack: 0.002, bend: 0.72, bendTime: 0.05, ratios: WOOD_RATIOS },
        { at: 0.12, freq: E4, dur: 0.4, gain: 0.24, sustain: 0.22, attack: 0.006, partials: [1, 0.28, 0.1] },
      ],
      rest: [
        { at: 0, freq: 620, dur: 0.09, gain: 0.36, sustain: 0.05, attack: 0.002, bend: 0.72, bendTime: 0.05, ratios: WOOD_RATIOS },
        { at: 0.13, freq: 440, dur: 0.1, gain: 0.33, sustain: 0.06, attack: 0.002, bend: 0.72, bendTime: 0.06, ratios: WOOD_RATIOS },
      ],
      done: [
        { at: 0, freq: 900, dur: 0.08, gain: 0.39, sustain: 0.05, attack: 0.002, bend: 0.72, bendTime: 0.05, ratios: WOOD_RATIOS },
        { at: 0.11, freq: 900, dur: 0.08, gain: 0.33, sustain: 0.05, attack: 0.002, bend: 0.72, bendTime: 0.05, ratios: WOOD_RATIOS },
        { at: 0.22, freq: 1150, dur: 0.08, gain: 0.42, sustain: 0.05, attack: 0.002, bend: 0.72, bendTime: 0.05, ratios: WOOD_RATIOS },
        { at: 0.36, freq: 1400, dur: 0.09, gain: 0.48, sustain: 0.05, attack: 0.002, bend: 0.72, bendTime: 0.05, ratios: WOOD_RATIOS },
        { at: 0.36, freq: E4, dur: 0.9, gain: 0.27, sustain: 0.3, attack: 0.006, partials: [1, 0.3, 0.12] },
      ],
    },
  },
  {
    id: "bell",
    name: "Bell",
    blurb: "Boxing-gym metal. Round starts, round ends.",
    cues: {
      count: [{ at: 0, freq: A5, dur: 0.2, gain: 0.24, sustain: 0.12, attack: 0.003, ratios: BELL_RATIOS }],
      // ding-ding, the way the round actually gets called
      go: [
        { at: 0, freq: A5, dur: 0.9, gain: 0.32, sustain: 0.13, attack: 0.003, ratios: BELL_RATIOS },
        { at: 0.19, freq: A5, dur: 1.1, gain: 0.32, sustain: 0.13, attack: 0.003, ratios: BELL_RATIOS },
      ],
      rest: [{ at: 0, freq: A4, dur: 1.1, gain: 0.26, sustain: 0.14, attack: 0.004, ratios: BELL_RATIOS }],
      done: [
        { at: 0, freq: A5, dur: 0.6, gain: 0.28, sustain: 0.13, attack: 0.003, ratios: BELL_RATIOS },
        { at: 0.22, freq: A5, dur: 0.6, gain: 0.28, sustain: 0.13, attack: 0.003, ratios: BELL_RATIOS },
        { at: 0.44, freq: A5, dur: 1.6, gain: 0.3, sustain: 0.16, attack: 0.003, ratios: BELL_RATIOS },
        { at: 0.44, freq: A4, dur: 1.7, gain: 0.16, sustain: 0.16, attack: 0.004, ratios: BELL_RATIOS },
      ],
    },
  },
];

const DEFAULT_CUE_PACK = "mellow";
const CUE_PACK_KEY = "abs-timer-cue-pack";
const VOLUME_KEY = "abs-timer-volume";

const cuePackById = (id) =>
  CUE_PACKS.filter((p) => p.id === id)[0] || CUE_PACKS.filter((p) => p.id === DEFAULT_CUE_PACK)[0];

// Returns the created oscillators so a pause/skip can cancel what is still pending.
const playCue = (ctx, name, at, packId) => {
  const parts = cuePackById(packId).cues[name];
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

// Audition a pack from the picker. Each tap cuts off the one before it, so
// tapping down the row doesn't pile up overlapping multi-second cues.
let previewNodes = [];
const previewCue = (packId, name) => {
  const ctx = audioCtx();
  if (!ctx) return;
  previewNodes.forEach((n) => {
    try {
      n.stop(0);
    } catch (e) {
      /* already finished */
    }
  });
  previewNodes = playCue(ctx, name || "go", ctx.currentTime + 0.03, packId);
};
