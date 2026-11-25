import { ARENA, wrapShip } from './sim/arena.js';
import { createShip, integrate, SHIP_PHYSICS } from './sim/ship.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { createCanvasSurface } from './render/canvas.js';
import { createRenderer } from './render/draw.js';

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(window.location.search);
const experiment = ['block', 'interval', 'variable'].includes(params.get('experiment'))
  ? params.get('experiment')
  : null;
const autoThrust = params.get('autothrust') === '1';

const canvas = $('#arena');
const surface = createCanvasSurface(canvas);
const renderer = createRenderer(surface);
const input = createInput();
let current = createShip(ARENA.width / 2, ARENA.height / 2);
let previous = { ...current };
let simulatedSeconds = 0;
let benchmarkComplete = false;
let paused = false;
let lastHudUpdate = 0;

function resetShip() {
  current = createShip(ARENA.width / 2, ARENA.height / 2);
  previous = { ...current };
  simulatedSeconds = 0;
  benchmarkComplete = false;
  input.endStep();
  updateFlightTelemetry();
}

function simulate(dt) {
  if (autoThrust && benchmarkComplete) return;
  if (input.justPressed('KeyR') && !autoThrust) resetShip();

  previous = { ...current };
  const controls = autoThrust
    ? { thrust: true, brake: false, turnLeft: false, turnRight: false }
    : input.snapshot();
  const actualDt = autoThrust ? Math.min(dt, Math.max(0, 5 - simulatedSeconds)) : dt;
  current = wrapShip(integrate(current, controls, actualDt));
  simulatedSeconds += actualDt;
  input.endStep();

  if (autoThrust && simulatedSeconds >= 5 - 1e-9) {
    benchmarkComplete = true;
    const result = {
      experiment: experiment || 'fixed',
      simSeconds: Number(simulatedSeconds.toFixed(4)),
      x: Number(current.x.toFixed(4)),
      y: Number(current.y.toFixed(4)),
      velocity: Number(Math.hypot(current.vx, current.vy).toFixed(4)),
    };
    console.info('[SPACE ARENA] 5-second controlled thrust benchmark', result);
    $('#experiment-alert').hidden = false;
    $('#experiment-alert').textContent = `5.00s benchmark finished: x=${result.x}, y=${result.y}, speed=${result.velocity}. See console for full result.`;
  }
}

function updateFlightTelemetry() {
  const speed = Math.hypot(current.vx, current.vy);
  const headingDeg = ((current.angle * 180 / Math.PI) % 360 + 360) % 360;
  $('#speed').textContent = Math.round(speed);
  $('#speed-bar').style.width = `${Math.min(100, speed / SHIP_PHYSICS.maximumSpeed * 100)}%`;
  $('#heading').textContent = Math.round(headingDeg);
  $('#heading-arrow').style.transform = `rotate(${current.angle}rad)`;
  $('#position').textContent = `${Math.round(current.x)} : ${Math.round(current.y)}`;
  $('#canvas-coordinates').innerHTML = `X ${String(Math.round(current.x)).padStart(4, '0')} <span>/</span> Y ${String(Math.round(current.y)).padStart(4, '0')}`;
  $('#thrust-indicator').textContent = current.thrusting ? 'ENGAGED' : 'IDLE';
  $('#thrust-indicator').classList.toggle('engaged', current.thrusting);
  for (const key of ['w', 'a', 's', 'd']) {
    $(`#key-${key}`).classList.toggle('pressed', input.isDown(`Key${key.toUpperCase()}`));
  }
}

function updateStats(stats) {
  $('#frames-per-second').textContent = Math.round(stats.fps);
  $('#steps-per-second').textContent = Math.round(stats.stepsPerSecond);
}

const loop = createLoop({
  simulate,
  render(alpha, stats, timestamp) {
    renderer.render(previous, current, alpha, timestamp);
    if (timestamp - lastHudUpdate > 90) {
      lastHudUpdate = timestamp;
      $('#frame-time').textContent = stats.frameMs.toFixed(1);
      updateFlightTelemetry();
    }
  },
  onStats: updateStats,
  scheduler: experiment === 'interval' ? 'interval' : 'raf',
  variableTimestep: experiment === 'variable',
  blockEvery60Frames: experiment === 'block',
});

function setPaused(next) {
  paused = next;
  if (paused) loop.stop();
  else loop.start();
  $('#pause-overlay').hidden = !paused;
  $('#pause-label').textContent = paused ? 'Resume simulation' : 'Pause simulation';
  $('#pause-icon').textContent = paused ? '▶' : 'Ⅱ';
  $('#pause-button').setAttribute('aria-pressed', String(paused));
  $('#system-status').textContent = paused ? 'SYSTEM PAUSED' : 'SYSTEM ONLINE';
  $('.online-pill').classList.toggle('is-paused', paused);
  $('.flight-tag').classList.toggle('is-paused', paused);
  if (!paused) canvas.focus({ preventScroll: true });
}

$('#pause-button').addEventListener('click', () => setPaused(!paused));
$('#reset-button').addEventListener('click', () => resetShip());
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyP' && !event.repeat && !['INPUT', 'TEXTAREA'].includes(event.target?.tagName)) {
    setPaused(!paused);
  }
  if (event.code === 'KeyR' && paused) resetShip();
});

if (experiment) {
  $('#experiment-alert').hidden = false;
  const labels = {
    block: 'Experiment 1: blocking render for 100 ms every 60th frame — inspect FPS and jitter.',
    interval: 'Experiment 2: using setInterval(..., 16) instead of requestAnimationFrame.',
    variable: 'Experiment 3: variable timestep — try Chrome DevTools CPU throttling 6×.',
  };
  $('#experiment-alert').textContent = labels[experiment];
}
if (autoThrust && !experiment) {
  $('#experiment-alert').hidden = false;
  $('#experiment-alert').textContent = 'Automated 5 s thrust benchmark: the ship will fly straight ahead.';
}

// Intentionally read-only observation point for DevTools and scripted experiments.
window.__spaceArenaDebug = Object.freeze({
  getState: () => ({ ...current, simulatedSeconds, benchmarkComplete }),
  getStats: () => loop.getStats(),
  getMode: () => experiment || 'fixed',
});

renderer.render(previous, current, 1, 0);
loop.start();
window.addEventListener('pagehide', () => {
  loop.stop();
  input.dispose();
  surface.dispose();
});
