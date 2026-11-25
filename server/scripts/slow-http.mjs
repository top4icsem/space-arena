import { createServer } from 'node:http';
import { createHttpHandler } from '../src/http.js';
import { RoomManager } from '../src/rooms.ts';

/** Reproducible, isolated 300 ms event-loop stall; no production ws dependency. */
const manager = new RoomManager({ seed: false });
const logs = { pathFor: () => null };
const server = createServer(
  createHttpHandler({ rooms: manager, logs, distDir: process.cwd(), slowDemo: true }),
);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const start = performance.now();
const slow = fetch(url + '/api/slow')
  .then((res) => res.json())
  .then(() => performance.now() - start);
await new Promise((resolve) => setTimeout(resolve, 20));
const health = fetch(url + '/health')
  .then((res) => res.json())
  .then(() => performance.now() - start);
console.log('Lab 04: intentional synchronous 300 ms event-loop block');
console.log({
  slowResponseMs: (await slow).toFixed(1),
  healthResponseMs: (await health).toFixed(1),
});
await new Promise((resolve) => server.close(resolve));
