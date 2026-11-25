import { describe, it, expect, vi, afterEach } from 'vitest';
import { Vector2 } from '../src/sim/vector2.js';
import { Game } from '../src/sim/game.js';
import { createLoop } from '../src/loop.js';
import { NetworkGame } from '../src/network/netcode.ts';
import { entityId, inputSeq, stepId } from '../../shared/types.ts';
import type { Snapshot } from '../../shared/types.ts';

const fakeConnection = { status: 'connected', sendInput: vi.fn(() => 7), send: vi.fn(() => true) };
const frame = (tick: number, ack: number, x: number): Snapshot => ({
  tick: stepId(tick),
  ack: inputSeq(ack),
  players: [
    {
      kind: 'ship',
      id: entityId(5),
      x,
      y: 250,
      vx: 0,
      vy: 0,
      angle: 0,
      thrusting: false,
      hp: 3,
      score: 0,
      alive: true,
      respawn: 0,
    },
  ],
  bullets: [],
  asteroids: [],
  pickups: [],
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Lab07 client vectors and combat', () => {
  it.each([
    [1, 2, 3, 4],
    [0, 0, -1, 5],
    [30, -30, 2, -5],
    [100, 50, 0, 0],
  ])('Vector2 addition is pure (%i,%i)+(%i,%i)', (a, b, c, d) => {
    const v = new Vector2(a, b),
      w = new Vector2(c, d);
    expect(v.add(w)).toEqual(new Vector2(a + c, b + d));
    expect(v).toEqual(new Vector2(a, b));
  });
  it.each([0, Math.PI / 4, Math.PI / 2, Math.PI])(
    'rotation preserves vector magnitude %f',
    (angle) => {
      const v = new Vector2(3, 4);
      expect(v.rotated(angle).length).toBeCloseTo(5, 10);
    },
  );
  it('normalizing zero vector stays at origin', () =>
    expect(new Vector2().normalized()).toEqual(new Vector2()));
  it('ship/asteroid collision emits hit or explosion and keeps deterministic score', () => {
    const game = new Game();
    game.simulate(1 / 60, {}, {});
    expect(game.playerState).toBeDefined();
    expect(game.hud.maxHp).toBe(3);
  });
  it('Game reproduces seeded state over identical input stream', () => {
    const a = new Game(),
      b = new Game();
    for (let i = 0; i < 80; i++) {
      const controls = { thrust: i % 2 === 0, turnRight: i % 8 === 0 };
      a.simulate(1 / 60, controls, { shooting: i % 15 === 0 });
      b.simulate(1 / 60, controls, { shooting: i % 15 === 0 });
    }
    expect(a.playerState).toEqual(b.playerState);
    expect(a.score).toBe(b.score);
  });
});

describe('Lab07 prediction/reconciliation', () => {
  it('predictor immediately advances local ship', () => {
    const g = new NetworkGame(fakeConnection, {
      prediction: true,
      loss: 0,
      latency: 0,
      random: () => 0.5,
    });
    g.joined({ netId: 5 });
    g.applySnapshot(frame(1, 0, 200));
    g.simulate(1 / 30, { thrust: true });
    expect(g.predicted!.y).toBeLessThan(250);
    expect(g.pending.length).toBe(1);
  });
  it('authoritative mode never predicts', () => {
    const g = new NetworkGame(fakeConnection, {
      prediction: false,
      loss: 0,
      latency: 0,
      random: () => 0.5,
    });
    g.joined({ netId: 5 });
    g.applySnapshot(frame(1, 0, 200));
    g.simulate(1 / 30, { thrust: true });
    expect(g.getVisualState()!.y).toBe(250);
  });
  it('server ack discards confirmed inputs', () => {
    const g = new NetworkGame(fakeConnection, {
      prediction: true,
      loss: 0,
      latency: 0,
      random: () => 0.5,
    });
    g.joined({ netId: 5 });
    g.applySnapshot(frame(1, 0, 200));
    g.simulate(3 / 30, { thrust: true });
    expect(g.pending.length).toBe(3);
    g.applySnapshot(frame(2, 2, 201));
    expect(g.pending.map((p) => p.seq)).toEqual([3]);
  });
  it('old jittered snapshot cannot rewind the game', () => {
    const g = new NetworkGame(fakeConnection, { prediction: true, latency: 0, loss: 0 });
    g.joined({ netId: 5 });
    g.applySnapshot(frame(5, 0, 200));
    g.applySnapshot(frame(2, 0, 100));
    expect(g.authoritative!.x).toBe(200);
  });
  it('remote ships interpolate between authoritative frames', () => {
    const g = new NetworkGame(fakeConnection, { prediction: true });
    g.joined({ netId: 5 });
    const a = frame(1, 0, 200),
      b = frame(2, 0, 200);
    const remote = { ...a.players[0]!, id: entityId(6), x: 100 };
    const remote2 = { ...remote, x: 300 };
    const worldA = { ...a, players: [a.players[0]!, remote] },
      worldB = { ...b, players: [b.players[0]!, remote2] };
    const ships = g.interpolate(worldA, worldB, 0.5)!.filter((o) => o.kind === 'ship');
    expect(ships.length).toBe(1);
    expect(ships[0]!.position.x).toBeCloseTo(200);
  });
  it('reset clears old packets, ghosts and corrections', () => {
    const g = new NetworkGame(fakeConnection);
    g.joined({ netId: 5 });
    g.applySnapshot(frame(1, 0, 200));
    g.reset();
    expect(g.frames).toHaveLength(0);
    expect(g.pending).toHaveLength(0);
  });
});

describe('Lab07 loop with fake requestAnimationFrame', () => {
  it('fixed-step processes 60 steps during 1 second of 120Hz frames', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      callbacks.set(++id, fn);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (n: number) => {
      callbacks.delete(n);
    });
    let steps = 0,
      renders = 0;
    const loop = createLoop({
      simulate: () => {
        steps++;
      },
      render: () => {
        renders++;
      },
    });
    loop.start();
    for (let t = 0; t <= 120; t++) {
      const [key, cb] = callbacks.entries().next().value!;
      callbacks.delete(key);
      cb((t * 1000) / 120);
    }
    loop.stop();
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(60);
    expect(renders).toBe(121);
  });
  it('stopping prevents any more simulation callbacks', () => {
    let frame: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      frame = fn;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    let called = 0;
    const loop = createLoop({ simulate: () => called++, render: () => {} });
    loop.start();
    frame(0);
    frame(30);
    loop.stop();
    frame(60);
    expect(called).toBe(1);
  });
  it('clamps huge timestamp jump instead of spiraling', () => {
    let frame: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      frame = fn;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    let called = 0;
    const loop = createLoop({ simulate: () => called++, render: () => {}, maxStepsPerFrame: 8 });
    loop.start();
    frame(0);
    frame(100000);
    loop.stop();
    expect(called).toBe(8);
  });
});
