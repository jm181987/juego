// Procedural WebAudio SFX — no external assets.
let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Sword swing: fast whoosh (filtered noise sweep). */
export function playSwing() {
  const a = ac();
  if (!a) return;
  const dur = 0.22;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(400, a.currentTime);
  bp.frequency.exponentialRampToValueAtTime(2400, a.currentTime + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.5, a.currentTime + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  src.connect(bp).connect(g).connect(a.destination);
  src.start();
  src.stop(a.currentTime + dur + 0.02);
}

/** Enemy death vocalization by gender. */
export function playDeath(gender: "male" | "female") {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime;
  const dur = gender === "female" ? 0.9 : 0.7;
  // Voiced formant tone
  const osc = a.createOscillator();
  osc.type = "sawtooth";
  const baseF = gender === "female" ? 620 : 180;
  const endF = gender === "female" ? 260 : 90;
  osc.frequency.setValueAtTime(baseF, t0);
  osc.frequency.exponentialRampToValueAtTime(endF, t0 + dur);
  // Vibrato/wobble for scream / grunt
  const lfo = a.createOscillator();
  const lfoGain = a.createGain();
  lfo.frequency.value = gender === "female" ? 14 : 22;
  lfoGain.gain.value = gender === "female" ? 40 : 12;
  lfo.connect(lfoGain).connect(osc.frequency);
  // Formant filter
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = gender === "female" ? 6 : 4;
  bp.frequency.setValueAtTime(gender === "female" ? 1400 : 700, t0);
  bp.frequency.exponentialRampToValueAtTime(gender === "female" ? 600 : 300, t0 + dur);
  // Amplitude envelope
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gender === "female" ? 0.35 : 0.4, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(bp).connect(g).connect(a.destination);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);

  // Breath noise layer
  const bufLen = Math.floor(a.sampleRate * dur);
  const nbuf = a.createBuffer(1, bufLen, a.sampleRate);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
  const nsrc = a.createBufferSource();
  nsrc.buffer = nbuf;
  const nf = a.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.value = gender === "female" ? 1800 : 900;
  nf.Q.value = 1.2;
  const ng = a.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.15, t0 + 0.05);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  nsrc.connect(nf).connect(ng).connect(a.destination);
  nsrc.start(t0);
  nsrc.stop(t0 + dur + 0.02);
}

/** Gender mapping by enemy kind. */
export function genderFor(kind: "goblin" | "wraith" | "brute"): "male" | "female" {
  return kind === "wraith" ? "female" : "male";
}
