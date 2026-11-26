// Ridgeline Run — the cockpit instruments.
// One clear job: keep the HUD honest. Every number comes from the flight model,
// drawn on small canvases and DOM bars so the instruments glow in screenshots.

import { FLIGHT, RINGS } from './config.js';
import { altitudeAgl, feet, headingDeg, knots } from './flight.js';

function $(id) {
  return document.getElementById(id);
}

export function createHud() {
  return {
    compass: $('compass'),
    speedTape: $('speed-tape'),
    altTape: $('alt-tape'),
    horizon: $('horizon'),
    throttleFill: $('throttle-fill'),
    throttleText: $('throttle-text'),
    fuelFill: $('fuel-fill'),
    fuelText: $('fuel-text'),
    ringsText: $('rings-text'),
    scoreText: $('score-text'),
    timeText: $('time-text'),
    nextText: $('next-text'),
    message: $('message'),
    hint: $('hint'),
    title: $('screen-title'),
    pause: $('screen-pause'),
    end: $('screen-end'),
    endTitle: $('end-title'),
    endBody: $('end-body'),
    hud: $('hud'),
    selftest: $('selftest'),
  };
}

function drawCompass(canvas, heading) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8, 14, 22, 0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120, 220, 255, 0.35)';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  // One tick per 5 degrees, labels every 30; the tape slides with heading.
  const pxPerDeg = 4;
  const centre = w / 2;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 5) {
    const deg = ((Math.round(heading) + d) % 360 + 360) % 360;
    const x = centre + d * pxPerDeg;
    const major = deg % 30 === 0;
    ctx.strokeStyle = major ? '#8fe3ff' : 'rgba(143, 227, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(x, h - 6);
    ctx.lineTo(x, h - (major ? 20 : 12));
    ctx.stroke();
    if (major) {
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
      ctx.fillStyle = '#dff4ff';
      ctx.fillText(label, x, 16);
    }
  }
  // Fixed lubber line and the heading readout.
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.moveTo(centre - 7, 0);
  ctx.lineTo(centre + 7, 0);
  ctx.lineTo(centre, 10);
  ctx.fill();
  ctx.fillStyle = '#ffb347';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(String(Math.round(heading)).padStart(3, '0') + '°', centre, h - 24);
}

function drawTape(canvas, value, unit, step, range) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8, 14, 22, 0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120, 220, 255, 0.35)';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  const pxPerUnit = (h - 40) / range;
  const centre = h / 2;
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  const base = Math.floor(value / step) * step;
  for (let v = base - range / 2; v <= base + range / 2 + step; v += step) {
    if (v < 0) continue;
    const y = centre - (v - value) * pxPerUnit;
    if (y < 14 || y > h - 14) continue;
    const major = v % (step * 5) === 0;
    ctx.strokeStyle = major ? '#8fe3ff' : 'rgba(143, 227, 255, 0.4)';
    ctx.beginPath();
    ctx.moveTo(w - 16, y);
    ctx.lineTo(w - (major ? 4 : 9), y);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = '#dff4ff';
      ctx.fillText(String(v), 6, y + 4);
    }
  }
  // Current value box.
  ctx.fillStyle = '#0e2a3a';
  ctx.fillRect(0, centre - 15, w, 30);
  ctx.strokeStyle = '#8fe3ff';
  ctx.strokeRect(0.5, centre - 15.5, w - 1, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(value)), w / 2, centre + 6);
  ctx.fillStyle = '#8fe3ff';
  ctx.font = '11px monospace';
  ctx.fillText(unit, w / 2, h - 6);
}

function drawHorizon(canvas, pitch, roll, heading) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = 62;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const pitchPx = pitch * 90;
  ctx.translate(0, pitchPx);
  // Sky above, ground below.
  ctx.fillStyle = '#2f7fc4';
  ctx.fillRect(-r - 10, -r - 120, r * 2 + 20, r + 120);
  ctx.fillStyle = '#8a5a2e';
  ctx.fillRect(-r - 10, 0, r * 2 + 20, r + 120);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r - 10, 0);
  ctx.lineTo(r + 10, 0);
  ctx.stroke();
  // Pitch ladder lines every 10 degrees.
  ctx.lineWidth = 1;
  ctx.font = '10px monospace';
  ctx.fillStyle = '#ffffff';
  for (const deg of [-20, -10, 10, 20]) {
    const y = -deg * 1.5;
    ctx.beginPath();
    ctx.moveTo(-22, y);
    ctx.lineTo(22, y);
    ctx.stroke();
    ctx.fillText(String(Math.abs(deg)), 26, y + 3);
  }
  ctx.restore();
  // Fixed aircraft symbol and bezel.
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + 26, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(143, 227, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#dff4ff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('HDG ' + String(Math.round(heading)).padStart(3, '0'), cx, h - 6);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// Refresh every instrument from the flight state. mode: 'title' | 'flying' |
// 'paused' | 'landed' | 'crashed'. time is the wall-clock seconds for pulses.
export function updateHud(hud, f, mode, time) {
  const flying = mode === 'flying';
  hud.hud.style.opacity = flying || mode === 'paused' ? '1' : '0.25';
  drawCompass(hud.compass, headingDeg(f));
  drawTape(hud.speedTape, knots(f), 'KT', 10, 120);
  drawTape(hud.altTape, feet(altitudeAgl(f)), 'FT AGL', 100, 1200);
  drawHorizon(hud.horizon, f.pitch, f.roll, headingDeg(f));

  const throttlePct = Math.round(f.throttle * 100);
  hud.throttleFill.style.width = throttlePct + '%';
  hud.throttleText.textContent = 'THR ' + throttlePct + '%';
  const fuelPct = Math.round((f.fuel / FLIGHT.fuelMax) * 100);
  hud.fuelFill.style.width = fuelPct + '%';
  hud.fuelFill.style.background = fuelPct < 25 ? '#ff5a3c' : '#ffb347';
  hud.fuelText.textContent = 'FUEL ' + fuelPct + '%';

  hud.ringsText.textContent = `RINGS ${f.ringsHit} / ${RINGS.length}`;
  hud.scoreText.textContent = 'SCORE ' + f.score;
  hud.timeText.textContent = 'TIME ' + formatTime(f.elapsed);
  const ring = RINGS[f.nextRing];
  if (ring && f.ringsHit < RINGS.length) {
    const d = Math.hypot(f.x - ring.x, f.y - ring.y, f.z - ring.z);
    hud.nextText.textContent = `NEXT RING ${Math.round(d)}m`;
  } else if (f.ringsHit >= RINGS.length) {
    hud.nextText.textContent = 'ALL RINGS — LAND ON THE RUNWAY';
  } else {
    hud.nextText.textContent = '';
  }

  // Flashing centre message while it is fresh (flight clock, not wall clock).
  if (f.message && f.elapsed < f.messageUntil) {
    hud.message.textContent = f.message;
    hud.message.style.opacity = String(0.65 + 0.35 * Math.sin(time * 6));
  } else {
    hud.message.style.opacity = '0';
  }
  hud.hint.style.opacity = flying && f.elapsed < 14 ? '1' : '0';
}

export function showScreen(hud, name, data) {
  hud.title.style.display = name === 'title' ? 'flex' : 'none';
  hud.pause.style.display = name === 'pause' ? 'flex' : 'none';
  hud.end.style.display = name === 'end' ? 'flex' : 'none';
  if (name === 'end' && data) {
    hud.endTitle.textContent = data.title;
    hud.endTitle.style.color = data.win ? '#7dff9a' : '#ff8a6a';
    hud.endBody.innerHTML = data.body;
  }
}
