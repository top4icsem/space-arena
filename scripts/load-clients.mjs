/** Requires running `npm run dev` and MAX_ROOMS >= 24; benchmarks real WS transports, not browsers. */
import { WebSocket } from 'ws';
import { writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
const base = process.env.LOAD_URL ?? 'http://127.0.0.1:3000';
const wsBase = base.replace(/^http/, 'ws');
const profile = [];
const abort = (msg) => {
  throw new Error(msg);
};
const open = (url) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { perMessageDeflate: false });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
async function room(name) {
  const resp = await fetch(`${base}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!resp.ok) abort(`Cannot create room: HTTP ${resp.status}. Check MAX_ROOMS.`);
  return (await resp.json()).room.id;
}
async function sample(total) {
  const roomIds = [];
  for (let i = 0; i < Math.ceil(total / 8); i++) roomIds.push(await room(`Load ${total}-${i}`));
  const peers = [];
  try {
    for (let i = 0; i < total; i++) {
      const ws = await open(`${wsBase}/ws`);
      peers.push(ws);
      ws.send(
        JSON.stringify({
          v: 0,
          type: 'join',
          name: `Bot${i}`,
          room: roomIds[Math.floor(i / 8)],
          wire: 'binary',
        }),
      );
    }
    // All clients send the same encoded mask+seq as a real human would.
    const frame = new ArrayBuffer(7);
    const view = new DataView(frame);
    view.setUint8(0, 1);
    view.setUint8(1, 1);
    view.setUint8(6, 1);
    let seq = 0;
    const timer = setInterval(() => {
      view.setUint32(2, ++seq, true);
      for (const ws of peers) if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    }, 33);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    clearInterval(timer);
    const data = await (await fetch(`${base}/api/perf`)).json();
    return {
      clients: total,
      p50: data.p50,
      p95: data.p95,
      p99: data.p99,
      tickExceeded33ms: data.p99 > 33,
      rooms: data.rooms,
      bots: data.bots,
    };
  } finally {
    await Promise.all(
      peers.map(
        (ws) =>
          new Promise((resolve) => {
            if (ws.readyState === WebSocket.CLOSED) return resolve();
            const timeout = setTimeout(() => {
              ws.terminate();
              resolve();
            }, 400);
            ws.once('close', () => {
              clearTimeout(timeout);
              resolve();
            });
            ws.close(1000, 'Load done');
          }),
      ),
    );
  }
}
for (const n of [8, 32, 64, 128]) {
  const now = performance.now();
  try {
    const result = await sample(n);
    profile.push(result);
    console.log(result, `elapsed ${(performance.now() - now).toFixed(0)}ms`);
  } catch (err) {
    console.error(err);
    profile.push({ clients: n, error: String(err) });
    break;
  }
}
await mkdir('bench-out', { recursive: true });
await writeFile('bench-out/load.json', JSON.stringify(profile, null, 2));
const width = 760,
  height = 300,
  x = (n) => 80 + (n / 128) * 620;
const good = profile.filter((v) => typeof v.p99 === 'number');
const scale = Math.max(35, ...good.map((v) => v.p99)) * 1.2;
const y = (n) => 250 - (n / scale) * 185;
const points = good.map((v) => `${x(v.clients)},${y(v.p99)}`).join(' ');
const circles = good
  .map(
    (v) =>
      `<circle cx="${x(v.clients)}" cy="${y(v.p99)}" r="5" fill="#197b80"/><text x="${x(v.clients) + 6}" y="${y(v.p99) - 9}" font-size="12">${v.p99.toFixed(2)} ms</text>`,
  )
  .join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><text x="35" y="28" font-size="18">Server p99 tick time by WebSocket clients (measured)</text><line x1="80" x2="700" y1="250" y2="250" stroke="#555"/><line x1="80" x2="700" y1="${y(33)}" y2="${y(33)}" stroke="#ce3030" stroke-dasharray="5 4"/><text x="540" y="${y(33) - 8}" font-size="12" fill="#ce3030">33 ms budget</text>${[8, 32, 64, 128].map((n) => `<text x="${x(n) - 8}" y="270" font-size="12">${n}</text>`).join('')}<text x="320" y="292">Concurrent clients</text><polyline fill="none" stroke="#197b80" stroke-width="3" points="${points}"/>${circles}</svg>`;
await writeFile('bench-out/load.svg', svg);
console.log('Saved actual samples to bench-out/load.json and bench-out/load.svg');
