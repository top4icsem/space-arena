import { ARENA, wrapShip } from './sim/arena.js';
import { createShip, integrate, SHIP_PHYSICS } from './sim/ship.js';
import { Game } from './sim/game.js';
import { createInput } from './input.js';
import { createLoop } from './loop.js';
import { createCanvasSurface } from './render/canvas.js';
import { createRenderer } from './render/draw.js';
import { fetchJson, loadAll, measureLoading } from './assets/loader.js';
import { faultOptions, faultManifest } from './assets/failure-demo.js';
import { createAudioController } from './audio/audio.js';
import { Lobby } from './lobby/lobby.js';
import { createLobbyView } from './lobby/view.js';
import { drawLoading, drawLoadError } from './ui/loading.js';
import { SocketConnection } from './network/connection.ts';
import { NetworkGame } from './network/netcode.ts';
import { generateStarsInWorker } from './perf/starfield.js';

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(window.location.search);
const experiment = ['block', 'interval', 'variable'].includes(params.get('experiment'))
  ? params.get('experiment')
  : null;
const autoThrust = params.get('autothrust') === '1';
const networkMode = !autoThrust && params.get('legacy') !== '1';
const wire = params.get('wire') === 'json' ? 'json' : 'binary';
let failureMode = params.get('failure');
const canvas = $('#arena');
const surface = createCanvasSurface(canvas);
const input = createInput();
const eventBus = new EventTarget();
const audio = createAudioController(eventBus);
const lobby = new Lobby();
const connection = new SocketConnection();
const netGame = new NetworkGame(connection, {
  prediction: params.get('predict') !== '0',
  divergence: params.get('diverge') === '1',
  latency: Number(params.get('latency') || 0),
  jitter: Number(params.get('jitter') || 0),
  loss: Number(params.get('loss') || 0),
});
netGame.eventBus = eventBus;
const chatStatus = $('#network-status');
const roster = $('#network-roster');
const chatMessages = $('#chat-messages');
let game = null;
let renderer = null;
let manifest = null;
let resources = null;
let activeRoom = null;
let pilotName = '';
let phase = 'loading';
let loadingController = null;
let watcherController = null;
let current = createShip(ARENA.width / 2, ARENA.height / 2);
let previous = { ...current };
let simulatedSeconds = 0;
let benchmarkComplete = false;
let paused = false;
let lastHudUpdate = 0;

const lobbyView = createLobbyView($('#lobby-overlay'), {
  onJoin: async (name, roomId) => {
    // Unlock Web Audio synchronously in the Join gesture, before any await.
    audio.unlock();
    try {
      lobbyView.error('Joining live Node.js room…');
      const welcome = await connection.join(name, roomId, wire, params.get('bots') === '8' ? 8 : 0);
      netGame.joined(welcome);
      lobby.join(name, roomId);
    } catch (error) {
      lobbyView.error(`Could not join: ${error.message}`);
      connection.disconnect();
    }
  },
  onRetry: () => {
    void lobby.refresh();
  },
  onSound: () => {
    audio.setMuted(!audio.muted);
    $('#sound-toggle').textContent = `♪ SOUND: ${audio.muted ? 'OFF' : 'ON'}`;
    $('#mute-button').lastElementChild.textContent = audio.muted ? 'Sound off' : 'Sound on';
  },
});

function resetSimulation() {
  if (phase !== 'playing') return;
  if (networkMode) {
    // R resets client-side prediction drift, never teleports the server's ship.
    netGame.offset = { x: 0, y: 0 };
    current = netGame.getVisualState() || createShip(ARENA.width / 2, ARENA.height / 2);
    previous = { ...current };
  } else {
    game = new Game({ roomConfig: activeRoom, eventBus });
    current = autoThrust ? createShip(ARENA.width / 2, ARENA.height / 2) : game.playerState;
    previous = { ...current };
  }
  simulatedSeconds = 0;
  benchmarkComplete = false;
  input.endStep();
  $('#experiment-alert').hidden = !experiment && !autoThrust;
  updateFlightTelemetry();
}

function simulate(dt) {
  if (phase !== 'playing') return;
  if (autoThrust && benchmarkComplete) return;
  if (input.justPressed('KeyR') && !autoThrust) resetSimulation();
  previous = { ...current };
  if (autoThrust) {
    const actualDt = Math.min(dt, Math.max(0, 5 - simulatedSeconds));
    current = wrapShip(
      integrate(
        current,
        { thrust: true, brake: false, turnLeft: false, turnRight: false },
        actualDt,
      ),
    );
    simulatedSeconds += actualDt;
    if (simulatedSeconds >= 5 - 1e-9) {
      benchmarkComplete = true;
      const result = {
        experiment: experiment || 'fixed',
        simSeconds: Number(simulatedSeconds.toFixed(4)),
        x: Number(current.x.toFixed(4)),
        y: Number(current.y.toFixed(4)),
        velocity: Number(Math.hypot(current.vx, current.vy).toFixed(4)),
      };
      console.info('[SPACE ARENA] Lab 01 5-second benchmark', result);
      $('#experiment-alert').hidden = false;
      $('#experiment-alert').textContent =
        `5.00s benchmark: x=${result.x}, y=${result.y}, speed=${result.velocity}.`;
    }
  } else if (networkMode) {
    netGame.simulate(dt, {
      ...input.snapshot(),
      fire: input.isDown('Space'),
      guided: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
    });
    current = netGame.getVisualState() || current;
  } else {
    game.simulate(dt, input.snapshot(), {
      shooting: input.isDown('Space'),
      guided: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
    });
    current = game.playerState;
  }
  input.endStep();
}

function updateFlightTelemetry() {
  if (phase !== 'playing') return;
  const speed = Math.hypot(current.vx, current.vy);
  const headingDeg = ((((current.angle * 180) / Math.PI) % 360) + 360) % 360;
  $('#speed').textContent = Math.round(speed);
  $('#speed-bar').style.width = `${Math.min(100, (speed / SHIP_PHYSICS.maximumSpeed) * 100)}%`;
  $('#heading').textContent = Math.round(headingDeg);
  $('#heading-arrow').style.transform = `rotate(${current.angle}rad)`;
  $('#position').textContent = `${Math.round(current.x)} : ${Math.round(current.y)}`;
  $('#canvas-coordinates').innerHTML =
    `X ${String(Math.round(current.x)).padStart(4, '0')} <span>/</span> Y ${String(Math.round(current.y)).padStart(4, '0')}`;
  $('#thrust-indicator').textContent = current.thrusting ? 'ENGAGED' : 'IDLE';
  $('#thrust-indicator').classList.toggle('engaged', current.thrusting);
  for (const key of ['w', 'a', 's', 'd']) {
    $(`#key-${key}`).classList.toggle('pressed', input.isDown(`Key${key.toUpperCase()}`));
  }
  if (!autoThrust && (game || networkMode)) {
    const hud = networkMode ? netGame.hud : game.hud;
    $('#score').textContent = hud.score.toLocaleString('en-US');
    $('#health').textContent = `${'♥'.repeat(hud.hp)}${'♡'.repeat(hud.maxHp - hud.hp)}`;
    $('#asteroids').textContent = String(hud.asteroids);
    $('#bullets').textContent = String(hud.bullets);
    $('#respawn-status').textContent =
      hud.respawnIn > 0 ? `RESPAWN ${hud.respawnIn.toFixed(1)}s` : 'READY';
  }
  if (networkMode) {
    const stats = netGame.stats;
    $('#net-rtt').textContent = stats.rtt == null ? '—' : `${stats.rtt.toFixed(0)} ms`;
    $('#net-age').textContent = stats.age == null ? '—' : `${stats.age} ms`;
    $('#net-bytes').textContent = `${stats.inRate} ↓ / ${stats.outRate} ↑`;
    $('#net-queue').textContent = String(stats.queued);
    $('#net-correction').textContent = `${stats.correction.toFixed(1)} px`;
    $('#net-buffer').style.width = `${Math.min(100, stats.queued * 4)}%`;
  }
}

const loop = createLoop({
  simulate,
  render(alpha, stats, timestamp) {
    if (phase !== 'playing' || !renderer) return;
    renderer.render(
      previous,
      current,
      alpha,
      timestamp,
      networkMode ? netGame.getWorld() : autoThrust ? null : game.world,
    );
    if (timestamp - lastHudUpdate > 90) {
      lastHudUpdate = timestamp;
      $('#frame-time').textContent = stats.frameMs.toFixed(1);
      updateFlightTelemetry();
    }
  },
  onStats: (stats) => {
    $('#frames-per-second').textContent = Math.round(stats.fps);
    $('#steps-per-second').textContent = Math.round(stats.stepsPerSecond);
  },
  scheduler: experiment === 'interval' ? 'interval' : 'raf',
  variableTimestep: experiment === 'variable',
  blockEvery60Frames: experiment === 'block',
});

function setPaused(next) {
  if (phase !== 'playing') return;
  paused = next;
  if (paused) loop.stop();
  else loop.start();
  if (networkMode) $('#system-status').textContent = 'SERVER CONTINUES WHEN PAUSED';
  $('#pause-overlay').hidden = !paused;
  $('#pause-label').textContent = paused ? 'Resume simulation' : 'Pause simulation';
  $('#pause-icon').textContent = paused ? '▶' : 'Ⅱ';
  $('#pause-button').setAttribute('aria-pressed', String(paused));
  $('#system-status').textContent = paused ? 'SYSTEM PAUSED' : 'SYSTEM ONLINE';
  $('.online-pill').classList.toggle('is-paused', paused);
  $('.flight-tag').classList.toggle('is-paused', paused);
  if (!paused) canvas.focus({ preventScroll: true });
}

async function showLobby() {
  connection.disconnect();
  netGame.reset();
  roster.replaceChildren();
  chatMessages.replaceChildren();
  phase = 'lobby';
  loop.stop();
  paused = false;
  $('#pause-overlay').hidden = true;
  renderer.render(previous, current, 1, 0, null);
  lobbyView.show();
  $('#system-status').textContent = 'ROOMS ONLINE';
  watcherController = new AbortController();
  lobby.addEventListener('roomerror', showRoomError);
  lobby.start();
  // Consume an async stream of room refresh events in the DOM layer.
  void (async () => {
    try {
      for await (const rooms of lobby.updates({ signal: watcherController.signal })) {
        lobbyView.renderRooms(rooms);
      }
    } catch (error) {
      if (!watcherController.signal.aborted) lobbyView.error(error.message);
    }
  })();
}

function showRoomError(event) {
  lobbyView.error(
    `Network error: ${event.detail.message}. Try REFRESH; the previous list stays available.`,
  );
}

lobby.addEventListener('join', ({ detail }) => {
  if (watcherController) watcherController.abort();
  lobby.removeEventListener('roomerror', showRoomError);
  lobbyView.hide();
  activeRoom = detail.room;
  pilotName = detail.name;
  phase = 'playing';
  $('#sector-label').textContent = detail.room.name.toUpperCase();
  $('.arena-lower-left').textContent =
    `✧ ${pilotName.toUpperCase()} / ${detail.room.name.toUpperCase()}`;
  $('#system-status').textContent = 'SYSTEM ONLINE';
  resetSimulation();
  if (experiment) {
    const messages = {
      block: 'Lab 01: 100 ms event-loop block',
      interval: 'Lab 01: timer scheduler',
      variable: 'Lab 01: variable timestep',
    };
    $('#experiment-alert').textContent = messages[experiment];
    $('#experiment-alert').hidden = false;
  }
  if (autoThrust) {
    $('#experiment-alert').hidden = false;
    $('#experiment-alert').textContent = 'Lab 01 automated 5-second trajectory benchmark.';
  }
  renderer.render(
    previous,
    current,
    1,
    0,
    networkMode ? netGame.getWorld() : autoThrust ? null : game.world,
  );
  loop.start();
  canvas.focus({ preventScroll: true });
});

async function boot() {
  loadingController?.abort();
  loadingController = new AbortController();
  const signal = loadingController.signal;
  phase = 'loading';
  loop.stop();
  lobby.stop();
  watcherController?.abort();
  lobbyView.hide();
  $('#asset-failure').hidden = true;
  $('#pause-overlay').hidden = true;
  $('#system-status').textContent = 'LOADING ASSETS';
  drawLoading(surface, { completed: 0, total: 1, file: '/assets/manifest.json' });
  try {
    manifest = await fetchJson('/assets/manifest.json', { signal });
    const faultyManifest = faultManifest(manifest, failureMode);
    const options = faultOptions(failureMode, loadingController);
    resources = await loadAll(faultyManifest, {
      ...options,
      signal,
      onProgress: ({ completed, total, file }) => drawLoading(surface, { completed, total, file }),
    });
    if (signal.aborted) return;
    renderer = createRenderer(surface, { sprites: resources.images });
    if (window.__lab07Starfield) renderer.setStarfield(window.__lab07Starfield.stars);
    audio.setBuffers(resources.audio);
    await showLobby();
  } catch (error) {
    if (signal.aborted && phase !== 'loading') return;
    loadingController.abort(); // cancel still-running sibling requests from Promise.all
    console.warn('[Space Arena] Recoverable asset error:', error);
    drawLoadError(surface, error.message);
    $('#asset-error-message').textContent = `${error.name}: ${error.message}`;
    $('#asset-failure').hidden = false;
    $('#system-status').textContent = 'LOAD FAILED';
  }
}

connection.addEventListener('snapshot', ({ detail }) => {
  if (networkMode) netGame.receive(detail.frame, detail.bytes);
});
connection.addEventListener('probe', ({ detail }) => {
  if (networkMode) netGame.rtt = Math.max(0, performance.now() - detail.sent);
});
connection.addEventListener('combat', ({ detail }) => {
  if (!networkMode || phase !== 'playing') return;
  const event = detail.event;
  if (event.type === 'fired' && event.player !== netGame.id) {
    eventBus.dispatchEvent(new CustomEvent('fired', { detail: { team: 'enemy' } }));
  }
  if (event.type === 'hit')
    eventBus.dispatchEvent(
      new CustomEvent('hit', { detail: { kind: event.asteroid ? 'asteroid' : 'ship' } }),
    );
  if (event.type === 'exploded')
    eventBus.dispatchEvent(
      new CustomEvent('exploded', { detail: { kind: event.asteroid ? 'asteroid' : 'ship' } }),
    );
});
connection.addEventListener('status', ({ detail }) => {
  chatStatus.textContent = String(detail).toUpperCase();
});
connection.addEventListener('roster', ({ detail }) => {
  roster.replaceChildren();
  for (const player of detail.players || []) {
    const name = document.createElement('span');
    name.className = 'roster-chip';
    name.textContent = player.name;
    roster.append(name);
  }
});
connection.addEventListener('chat', ({ detail }) => {
  const line = document.createElement('div');
  line.className = 'chat-line';
  const author = document.createElement('strong');
  author.textContent = `${detail.name}: `;
  line.append(author, document.createTextNode(detail.text));
  chatMessages.append(line);
  while (chatMessages.children.length > 80) chatMessages.firstChild.remove();
  chatMessages.scrollTop = chatMessages.scrollHeight;
});
connection.addEventListener('error', ({ detail }) => {
  const line = document.createElement('div');
  line.className = 'chat-error';
  line.textContent = detail.message;
  chatMessages.append(line);
});
$('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const field = $('#chat-input');
  const text = field.value.trim();
  if (!text || phase !== 'playing') return;
  connection.send('chat', { text });
  field.value = '';
  canvas.focus({ preventScroll: true });
});
$('#retry-assets').addEventListener('click', () => {
  const next = new URL(location.href);
  next.searchParams.delete('failure');
  failureMode = null;
  history.replaceState(null, '', next);
  // This is an opt-in worker experiment. Normal launch uses the faster synchronous cached backdrop.
  if (params.get('worker') === '1') {
    void generateStarsInWorker()
      .then(({ stars, totalMs, workerMs }) => {
        // When resources finish, the renderer is replaced; use a hook to apply the atlas on boot.
        window.__lab07Starfield = { stars, totalMs, workerMs };
        renderer?.setStarfield(stars);
        console.info('[Lab07] Worker starfield', { totalMs, workerMs });
      })
      .catch((error) => console.warn('[Lab07] Worker experiment unavailable', error));
  }
  void boot();
});
$('#pause-button').addEventListener('click', () => setPaused(!paused));
$('#reset-button').addEventListener('click', resetSimulation);
$('#prediction-toggle').addEventListener('click', () => {
  netGame.prediction = !netGame.prediction;
  netGame.pending.length = 0;
  $('#prediction-toggle').textContent = netGame.prediction ? 'Prediction ON' : 'Server only';
});
$('#divergence-toggle').addEventListener('click', () => {
  netGame.divergence = !netGame.divergence;
  $('#divergence-toggle').textContent = netGame.divergence ? 'Divergence ON' : 'Divergence OFF';
});
$('#prediction-toggle').textContent = netGame.prediction ? 'Prediction ON' : 'Server only';
$('#divergence-toggle').textContent = netGame.divergence ? 'Divergence ON' : 'Divergence OFF';
$('#wire-mode').textContent = wire.toUpperCase();
$('#back-to-lobby').addEventListener('click', () => {
  if (phase !== 'playing') return;
  void showLobby();
});
$('#mute-button').addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  $('#mute-button').lastElementChild.textContent = audio.muted ? 'Sound off' : 'Sound on';
  $('#sound-toggle').textContent = `♪ SOUND: ${audio.muted ? 'OFF' : 'ON'}`;
  $('#mute-button').setAttribute('aria-pressed', String(audio.muted));
});
window.addEventListener('keydown', (event) => {
  if (phase !== 'playing') return;
  if (
    event.code === 'KeyP' &&
    !event.repeat &&
    !['INPUT', 'TEXTAREA'].includes(event.target?.tagName)
  )
    setPaused(!paused);
  if (event.code === 'KeyR' && paused) resetSimulation();
});

window.__spaceArenaDebug = Object.freeze({
  getState: () => ({ ...current, simulatedSeconds, benchmarkComplete, phase, pilotName }),
  getStats: () => loop.getStats(),
  getMode: () => experiment || 'fixed',
  getWorld: () =>
    game
      ? {
          score: game.score,
          hud: { ...game.hud },
          entities: [...game.world].map((e) => ({
            id: e.id,
            kind: e.kind,
            x: e.position.x,
            y: e.position.y,
            alive: e.alive,
          })),
        }
      : null,
  getThisDemo: () => ({ methodOwner: 'Ship', example: 'player.fire.bind(player)' }),
  getLoadStatus: () => ({
    phase,
    assets: manifest?.assets.length || 0,
    loaded: Boolean(resources),
    room: activeRoom?.id,
    audioUnlocked: audio.unlocked,
  }),
  getNetwork: () => ({
    status: connection.status,
    room: activeRoom?.id,
    queue: connection.queue.length,
    mode: wire,
    stats: netGame.stats,
    netId: netGame.id,
    players: netGame.frames.at(-1)?.players.length ?? 0,
    remoteShips: (netGame.frames.at(-1)?.players || [])
      .filter((p) => p.id !== netGame.id)
      .map((p) => ({ id: p.id, x: p.x, y: p.y })),
  }),
  // Measurements only; explicitly opt in from DevTools, not run in normal boot.
  compareAssetLoading: () => measureLoading(manifest),
  returnToLobby: () => {
    if (phase === 'playing') void showLobby();
  },
});

// This is an opt-in worker experiment. Normal launch uses the faster synchronous cached backdrop.
if (params.get('worker') === '1') {
  void generateStarsInWorker()
    .then(({ stars, totalMs, workerMs }) => {
      // When resources finish, the renderer is replaced; use a hook to apply the atlas on boot.
      window.__lab07Starfield = { stars, totalMs, workerMs };
      renderer?.setStarfield(stars);
      console.info('[Lab07] Worker starfield', { totalMs, workerMs });
    })
    .catch((error) => console.warn('[Lab07] Worker experiment unavailable', error));
}
void boot();
window.addEventListener('pagehide', () => {
  loadingController?.abort();
  watcherController?.abort();
  lobby.stop();
  connection.disconnect();
  netGame.reset();
  loop.stop();
  input.dispose();
  audio.close();
  surface.dispose();
});
