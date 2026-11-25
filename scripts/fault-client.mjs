/** WebSocket malformed-frame flood smoke test: run against a local test server. */
import { WebSocket } from 'ws';
import { once } from 'node:events';

const url = process.env.ARENA_WS || 'ws://127.0.0.1:3000/ws';
const origin = process.env.ARENA_ORIGIN || 'http://localhost:3000';
const socket = new WebSocket(url, { origin });
await once(socket, 'open');
const closed = new Promise((resolve, reject) => {
  socket.once('close', (code) => resolve(code));
  socket.once('error', reject);
  setTimeout(() => reject(new Error('Flood client was not disconnected')), 2500).unref();
});
let sent = 0;
// 1000 invalid JSON frames in a burst, bounded by socket backpressure and close.
for (let i = 0; i < 1000 && socket.readyState === WebSocket.OPEN; i++) {
  socket.send('{invalid');
  sent++;
}
const closeCode = await closed;
if (closeCode !== 1008 && closeCode !== 1009) throw new Error(`Unexpected close code ${closeCode}`);
console.log(JSON.stringify({ test: 'invalid-frame-flood', sent, closeCode, result: 'blocked' }));
