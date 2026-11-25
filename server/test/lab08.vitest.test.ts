import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { readConfig } from '../src/config.ts';
import { RoomManager } from '../src/rooms.ts';
import { attachWebSockets } from '../src/ws.ts';
import { createHttpHandler } from '../src/http.ts';
import { Telemetry, prometheus } from '../src/telemetry.ts';

const config = () =>
  readConfig({ ALLOWED_ORIGINS: 'https://arena.example', MAX_CONNECTIONS_PER_IP: '1', PORT: '0' });

describe('Lab 08: validated production configuration', () => {
  it('rejects empty production Origin allowlist', () =>
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(/ALLOWED_ORIGINS/));
  it('rejects wildcard, trailing slash and non-HTTP origins', () => {
    for (const value of [
      '*',
      'https://arena.example/',
      'file://local',
      'https://arena.example/path',
    ]) {
      expect(() => readConfig({ ALLOWED_ORIGINS: value })).toThrow();
    }
  });
  it('accepts exact origins and room/player/IP limits', () => {
    const data = readConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://arena.example',
      MAX_ROOMS: '8',
      MAX_PLAYERS: '5',
      MAX_CONNECTIONS_PER_IP: '2',
    });
    expect(data.allowedOrigins).toEqual(['https://arena.example']);
    expect([data.maxRooms, data.maxPlayers, data.maxConnectionsPerIp]).toEqual([8, 5, 2]);
  });
  it('rejects invalid per-IP cap and corrupt git SHA', () => {
    expect(() => readConfig({ MAX_CONNECTIONS_PER_IP: '0' })).toThrow();
    expect(() => readConfig({ BUILD_SHA: 'not_a_sha' })).toThrow();
  });
});

describe('Lab 08: health, readiness and Prometheus metrics', () => {
  it('exposes checked SHA, tag, readiness and metrics', async () => {
    const rooms = new RoomManager();
    const sample = {
      players: 2,
      rooms: 3,
      messagesPerSecond: 7,
      bytesInPerSecond: 32,
      bytesOutPerSecond: 64,
      stepMs: { p50: 1, p95: 2, p99: 3 },
      eventLoopUtilization: 0.1,
      eventLoopDelayMs: 2,
      memory: { rss: 1024, heapUsed: 512, heapTotal: 2048, external: 0 },
      uptimeSeconds: 12,
    };
    let ready = true;
    const handler = createHttpHandler({
      rooms,
      logs: { pathFor: () => null },
      distDir: process.cwd(),
      metrics: () => sample,
      ready: () => ready,
      buildSha: 'abcdef1234567',
      buildTag: 'v1.0.0',
    });
    const http = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    try {
      const address = http.address();
      if (!address || typeof address === 'string') throw Error('No address');
      const base = `http://127.0.0.1:${address.port}`;
      expect(await (await fetch(`${base}/health`)).json()).toMatchObject({
        sha: 'abcdef1234567',
        tag: 'v1.0.0',
      });
      expect((await fetch(`${base}/ready`)).status).toBe(200);
      ready = false;
      expect((await fetch(`${base}/ready`)).status).toBe(503);
      const response = await fetch(`${base}/metrics`);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(await response.text()).toContain('arena_step_p99_milliseconds 3');
    } finally {
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
  it('records incoming/outgoing rates and finite event-loop gauges', () => {
    const tel = new Telemetry();
    try {
      tel.recordIncoming(30);
      tel.recordOutgoing(70);
      const session = { performance: { p50: 1, p95: 2, p99: 3 } };
      const sample = tel.snapshot(new RoomManager(), session as never);
      expect(sample.messagesPerSecond).toBeGreaterThan(0);
      expect(sample.bytesOutPerSecond).toBeGreaterThan(0);
      expect(prometheus(sample)).toContain('arena_event_loop_utilization');
    } finally {
      tel.stop();
    }
  });
});

describe('Lab 08: WebSocket perimeter and graceful shutdown', () => {
  it('rejects a disallowed Origin and caps connections per TCP IP', async () => {
    const rooms = new RoomManager();
    const http = createServer((_req, res) => res.end('ok'));
    const ws = attachWebSockets(http, rooms, config());
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const addr = http.address();
    if (!addr || typeof addr === 'string') throw Error('No address');
    const url = `ws://127.0.0.1:${addr.port}/ws`;
    const forbidden = new WebSocket(url, { origin: 'https://evil.example' });
    try {
      const denial = await new Promise<number>((resolve, reject) => {
        forbidden.once('unexpected-response', (_request, response) =>
          resolve(response.statusCode || 0),
        );
        forbidden.once('error', reject);
      });
      expect(denial).toBe(403);
      const first = new WebSocket(url, { origin: 'https://arena.example' });
      await new Promise<void>((resolve, reject) => {
        first.once('open', resolve);
        first.once('error', reject);
      });
      try {
        const second = new WebSocket(url, { origin: 'https://arena.example' });
        const status = await new Promise<number>((resolve, reject) => {
          second.once('unexpected-response', (_request, response) =>
            resolve(response.statusCode || 0),
          );
          second.once('error', reject);
        });
        expect(status).toBe(429);
      } finally {
        first.terminate();
      }
    } finally {
      forbidden.terminate();
      await ws.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
});

describe('Lab 08: runtime attack and recovery', () => {
  it('flood client closes 1008 while a player in another room stays connected', async () => {
    const rooms = new RoomManager();
    const http = createServer((_req, res) => res.end('ok'));
    const ws = attachWebSockets(
      http,
      rooms,
      readConfig({
        ALLOWED_ORIGINS: 'https://arena.example',
        RATE_PER_SECOND: '12',
        MAX_CONNECTIONS_PER_IP: '4',
      }),
    );
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const addr = http.address();
    if (!addr || typeof addr === 'string') throw Error('No address');
    const url = `ws://127.0.0.1:${addr.port}/ws`;
    const good = new WebSocket(url, { origin: 'https://arena.example' });
    const bad = new WebSocket(url, { origin: 'https://arena.example' });
    try {
      await Promise.all(
        [good, bad].map(
          (s) =>
            new Promise<void>((resolve, reject) => {
              s.once('open', resolve);
              s.once('error', reject);
            }),
        ),
      );
      good.send(
        JSON.stringify({ v: 0, type: 'join', room: 'nebula', name: 'Good', wire: 'binary' }),
      );
      const joined = await new Promise<unknown>((resolve) => {
        good.on('message', function listener(raw, binary) {
          if (!binary && JSON.parse(String(raw)).type === 'joined') {
            good.off('message', listener);
            resolve(true);
          }
        });
      });
      expect(joined).toBe(true);
      const closeCode = new Promise<number>((resolve) =>
        bad.once('close', (code) => resolve(code)),
      );
      for (let n = 0; n < 1000 && bad.readyState === WebSocket.OPEN; n++) bad.send('{invalid');
      expect(await closeCode).toBe(1008);
      expect(good.readyState).toBe(WebSocket.OPEN);
      expect(rooms.get('nebula')?.size).toBe(1);
    } finally {
      good.terminate();
      bad.terminate();
      await ws.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
  it('SIGTERM-style drain sends shutdown and close code 1001', async () => {
    const rooms = new RoomManager();
    const http = createServer((_req, res) => res.end('ok'));
    const ws = attachWebSockets(
      http,
      rooms,
      readConfig({ ALLOWED_ORIGINS: 'https://arena.example' }),
    );
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const addr = http.address();
    if (!addr || typeof addr === 'string') throw Error('No address');
    const client = new WebSocket(`ws://127.0.0.1:${addr.port}/ws`, {
      origin: 'https://arena.example',
    });
    try {
      await new Promise<void>((resolve, reject) => {
        client.once('open', resolve);
        client.once('error', reject);
      });
      const messages: string[] = [];
      client.on('message', (raw, binary) => {
        if (!binary) messages.push(JSON.parse(String(raw)).type);
      });
      const closeCode = new Promise<number>((resolve) =>
        client.once('close', (code) => resolve(code)),
      );
      await ws.close();
      expect(await closeCode).toBe(1001);
      expect(messages).toContain('shutdown');
    } finally {
      client.terminate();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
});
