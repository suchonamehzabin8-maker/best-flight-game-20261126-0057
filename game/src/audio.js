// Ridgeline Run — synthesized sound, no audio files.
// One clear job: an engine drone that follows the throttle, wind that follows
// speed, and a chime, a thud and a fanfare for the moments that matter.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: two detuned saws through a low-pass, the classic prop drone.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 93;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a band-pass that opens with speed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      noise.start();
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  // Called every frame while flying: the drone and the wind follow the plane.
  function update(throttle, speed, flying) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const target = flying ? 0.05 + throttle * 0.075 : 0.0;
    engineGain.gain.setTargetAtTime(target, t, 0.1);
    engineOsc.frequency.setTargetAtTime(58 + throttle * 52 + speed * 0.12, t, 0.1);
    engineOsc2.frequency.setTargetAtTime(87 + throttle * 78 + speed * 0.18, t, 0.1);
    windGain.gain.setTargetAtTime(flying ? Math.min(0.09, (speed / 96) * 0.09) : 0, t, 0.15);
    windFilter.frequency.setTargetAtTime(500 + speed * 9, t, 0.2);
  }

  function blip(freq, start, dur, type, vol) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + start);
    g.gain.linearRampToValueAtTime(vol || 0.16, ctx.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.05);
  }

  function ring() {
    blip(880, 0, 0.35, 'sine', 0.2);
    blip(1318, 0.07, 0.4, 'sine', 0.16);
  }

  function crash() {
    blip(70, 0, 0.6, 'triangle', 0.3);
    blip(45, 0.05, 0.8, 'sawtooth', 0.2);
  }

  function land() {
    blip(523, 0, 0.3, 'sine', 0.18);
    blip(659, 0.1, 0.3, 'sine', 0.18);
    blip(784, 0.2, 0.5, 'sine', 0.2);
  }

  function click() {
    blip(1200, 0, 0.06, 'square', 0.06);
  }

  function toggleMute() {
    muted = !muted;
    if (ctx && engineGain) engineGain.gain.value = 0;
    if (ctx && windGain) windGain.gain.value = 0;
    return muted;
  }

  return { resume, update, ring, crash, land, click, toggleMute };
}
