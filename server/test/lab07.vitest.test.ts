import { describe, it, expect } from 'vitest';
import { RoomManager } from '../src/rooms.ts';
import { TickScheduler } from '../src/network/ticker.ts';
import { readConfig } from '../src/config.ts';
import { createHttpHandler } from '../src/http.ts';
import { attachWebSockets } from '../src/ws.ts';
import { RealtimeRooms } from '../src/network/realtime.ts';
import { WebSocket } from 'ws';
import { createServer } from 'node:http';

const person = (id: string) => ({ id, name: id });
describe('Lab07 room invariants', () => {
  it.each(['orion', 'nebula', 'zenith'])('persistent room %s survives last player', (id) => {
    const rooms = new RoomManager();
    const room = rooms.get(id)!;
    room.join(person('p'));
    room.leave('p');
    expect(rooms.get(id)).toBe(room);
  });
  it('custom room is removed when last player leaves', () => {
    const rooms = new RoomManager();
    const r = rooms.create({ name: 'QA sandbox' });
    r.join(person('p'));
    r.leave('p');
    expect(rooms.get(r.id)).toBeUndefined();
  });
  it('join/leave events observed in order', () => {
    const rooms = new RoomManager();
    const room = rooms.get('orion')!;
    const events: string[] = [];
    room.on('join', () => events.push('join'));
    room.on('leave', () => events.push('leave'));
    room.join(person('p'));
    room.leave('p');
    expect(events).toEqual(['join', 'leave']);
  });
  it('full room refuses extra members', () => {
    const rooms = new RoomManager({ maxPlayers: 1 });
    const room = rooms.get('orion')!;
    room.join(person('first'));
    expect(() => room.join(person('second'))).toThrow();
  });
});

describe('Lab07 deterministic scheduler and configuration', () => {
  it('scheduler hits target clock and stops cleanly', () => {
    let time = 0;
    let fn: () => void = () => {};
    const steps: number[] = [];
    const scheduler = new TickScheduler(() => steps.push(time), {
      now: () => time,
      schedule: (callback) => {
        fn = callback;
        return 1;
      },
      cancel: () => {
        fn = null;
      },
    });
    scheduler.start();
    time = 34;
    fn();
    time = 67;
    fn();
    expect(steps.length).toBe(2);
    scheduler.stop();
    expect(scheduler.running).toBe(false);
  });
  it.each(['PORT', 'MAX_ROOMS', 'MAX_PLAYERS', 'RATE_PER_SECOND', 'MAX_MESSAGE_BYTES'])(
    'rejects invalid %s',
    (key) => {
      expect(() => readConfig({ [key]: '-999' }, process.cwd())).toThrow();
    },
  );
  it('accepts a valid custom PORT', () => expect(readConfig({ PORT: '3999' }).port).toBe(3999));
  it('log directory contains resolved path', () =>
    expect(readConfig({ LOG_DIR: 'log-files' }).logDir).toMatch(/log-files$/));
  it('port 0 enables ephemeral bind', () => expect(readConfig({ PORT: '0' }).port).toBe(0));
});

describe('Lab07 server authoritative tick with bots', () => {
  it('eight bots use input sequence queue and never affect room roster', () => {
    const rooms = new RoomManager();
    const rt = new RealtimeRooms(rooms, () => {}, { seed: () => 234 });
    const room = rooms.get('orion')!;
    rt.enableBots(room, 8);
    expect(rt.performance.bots).toBe(8);
    rt.step();
    const world = rt.sessions.get('orion')!.world;
    expect(world.players.size).toBe(8);
    for (const player of world.players.values()) expect(player.ack).toBeGreaterThan(0);
    expect(room.size).toBe(0);
    rt.stop();
  });
  it('bots can be disabled to free player state', () => {
    const rooms = new RoomManager();
    const rt = new RealtimeRooms(rooms, () => {}, { seed: () => 234 });
    const room = rooms.get('orion')!;
    rt.enableBots(room, 8);
    rt.enableBots(room, 0);
    expect(rt.sessions.get('orion')!.world.players.size).toBe(0);
    rt.stop();
  });
  it('perf percentiles only use measured tick values', () => {
    const rt = new RealtimeRooms(new RoomManager(), () => {}, { seed: () => 234 });
    for (let i = 0; i < 15; i++) rt.step();
    const data = rt.performance;
    expect(data.n).toBe(15);
    expect(data.p50).toBeGreaterThanOrEqual(0);
    expect(data.p99).toBeGreaterThanOrEqual(data.p50);
    rt.stop();
  });
});

describe('Lab07 HTTP diagnostics', () => {
  it('metrics endpoint responds with real timing sample', async () => {
    const rooms = new RoomManager();
    const handle = createHttpHandler({
      rooms,
      logs: { pathFor: () => null },
      distDir: process.cwd(),
      metrics: () => ({ p99: 4.5, bots: 8 }),
    });
    const server = createServer((req, res) => void handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('bad address');
      const response = await fetch(`http://127.0.0.1:${addr.port}/api/perf`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ p99: 4.5, bots: 8 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('rejects path traversal and malformed API methods', async () => {
    const rooms = new RoomManager();
    const handle = createHttpHandler({
      rooms,
      logs: { pathFor: () => null },
      distDir: process.cwd(),
    });
    const server = createServer((req, res) => void handle(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    try {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw Error('bad');
      expect((await fetch(`http://127.0.0.1:${addr.port}/api/notfound`)).status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('Lab07 rate limiting real WS', () => {
  it('disconnects a flooding client with policy code', async () => {
    const server = createServer((_req, res) => res.end('OK'));
    const rooms = new RoomManager();
    const connected = attachWebSockets(server, rooms, { maxMessageBytes: 2048, ratePerSecond: 4 });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw Error('bad');
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/ws`);
    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });
      const closed = new Promise<number>((resolve) => ws.once('close', resolve));
      ws.send(JSON.stringify({ v: 0, type: 'join', room: 'orion', name: 'RateTester' }));
      for (let i = 0; i < 9; i++) ws.send(JSON.stringify({ v: 0, type: 'chat', text: `Hi${i}` }));
      expect(await closed).toBe(1008);
    } finally {
      ws.terminate();
      await connected.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 8000);
});
