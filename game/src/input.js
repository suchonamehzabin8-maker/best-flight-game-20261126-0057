// Ridgeline Run — keyboard and mouse.
// One clear job: turn keys and the mouse into one control vector the flight
// model reads, and report the one-shot keys (pause, restart, view, mute).

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false, down: false };
  const pressed = new Set(); // one-shot keys, consumed by main.js each frame

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(e.key.toLowerCase());
    keys.add(e.key.toLowerCase());
  }
  function onKeyUp(e) {
    keys.delete(e.key.toLowerCase());
  }
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
    mouse.y = ((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1;
    mouse.active = true;
  }
  function onMouseDown() {
    mouse.down = true;
  }
  function onMouseUp() {
    mouse.down = false;
  }
  function onBlur() {
    keys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  let throttle = 0.55;

  // Read the current control vector. Mouse steers when it has moved recently
  // and no arrow key is held; arrows always win when held.
  function read() {
    const pitchKeys = (keys.has('arrowdown') || keys.has('s') ? -1 : 0) + (keys.has('arrowup') || keys.has('w') ? 1 : 0);
    const rollKeys = (keys.has('arrowleft') || keys.has('a') ? -1 : 0) + (keys.has('arrowright') || keys.has('d') ? 1 : 0);
    let pitch = pitchKeys;
    let roll = rollKeys;
    if (mouse.active && pitchKeys === 0 && rollKeys === 0) {
      // Mouse: push the nose toward where the cursor sits.
      pitch = clampValue(-mouse.y * 0.9, -1, 1);
      roll = clampValue(mouse.x * 0.9, -1, 1);
    }
    // Throttle: Shift / R spools up, Ctrl / F spools down; PageUp/PageDown too.
    if (keys.has('shift') || keys.has('r')) throttle += 0.45 * 0.016;
    if (keys.has('control') || keys.has('f')) throttle -= 0.45 * 0.016;
    if (keys.has('pageup')) throttle += 0.9 * 0.016;
    if (keys.has('pagedown')) throttle -= 0.9 * 0.016;
    throttle = clampValue(throttle, 0, 1);
    return {
      pitch: clampValue(pitch, -1, 1),
      roll: clampValue(roll, -1, 1),
      throttle,
      brake: keys.has('b') || keys.has(' '),
    };
  }

  function setThrottle(v) {
    throttle = clampValue(v, 0, 1);
  }

  // Take and clear the one-shot keys pressed since the last frame.
  function takePressed() {
    const out = [...pressed];
    pressed.clear();
    return out;
  }

  function anyKey() {
    return keys.size > 0 || mouse.down;
  }

  return { read, setThrottle, takePressed, anyKey, mouse };
}

function clampValue(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
