import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { RoomManager } from '../src/rooms.js';
import { attachWebSockets } from '../src/ws.js';
import { WebSocket } from 'ws';
import { encodeInput, decodeSnapshot } from '../../shared/codec.js';

const next = (ws, type, timeout = 1500) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting ${type}`));
    }, timeout);
    const listener = (buffer, isBinary) => {
      if (isBinary) return; // Lab 05 also emits binary game snapshots
      const msg = JSON.parse(String(buffer));
      if (msg.type === type) {
        cleanup();
        resolve(msg);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', listener);
    };
    ws.on('message', listener);
  });
async function opened(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return ws;
}
test('Two live WS clients join one room, receive roster and broadcast chat', async () => {
  const server = createServer((_req, res) => res.end('OK'));
  const manager = new RoomManager({ seed: false });
  manager.create({ id: 'orion', name: 'Orion' });
  const connected = attachWebSockets(server, manager, { maxMessageBytes: 2048, ratePerSecond: 12 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  let a;
  let b;
  try {
    a = await opened(url);
    const ackA = next(a, 'joined');
    a.send(JSON.stringify({ v: 0, type: 'join', room: 'orion', name: 'Anna' }));
    assert.equal((await ackA).name, 'Anna');
    b = await opened(url);
    const ackB = next(b, 'joined');
    const rosterA = next(a, 'roster');
    b.send(JSON.stringify({ v: 0, type: 'join', room: 'orion', name: 'Bohdan' }));
    assert.equal((await ackB).name, 'Bohdan');
    assert.equal((await rosterA).players.length, 2);
    const receiveA = next(a, 'chat');
    const receiveB = next(b, 'chat');
    b.send(JSON.stringify({ v: 0, type: 'chat', text: 'Привіт!' }));
    assert.equal((await receiveA).text, 'Привіт!');
    assert.equal((await receiveB).name, 'Bohdan');
    const invalidClose = new Promise((resolve) => b.once('close', resolve));
    b.send(JSON.stringify({ v: 0, type: 'movement', x: 1 }));
    assert.equal(await invalidClose, 1008);
  } finally {
    a?.terminate();
    b?.terminate();
    await connected.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Lab 05: two players receive binary snapshots and server moves only after input', async () => {
  const server = createServer((_req, res) => res.end('OK'));
  const manager = new RoomManager({ seed: true });
  const connected = attachWebSockets(server, manager, { maxMessageBytes: 2048, ratePerSecond: 12 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let a, b;
  try {
    const url = `ws://127.0.0.1:${server.address().port}/ws`;
    a = await opened(url);
    b = await opened(url);
    const welcomeA = next(a, 'joined');
    const welcomeB = next(b, 'joined');
    a.send(JSON.stringify({ v: 0, type: 'join', room: 'orion', name: 'Pilot1', wire: 'binary' }));
    b.send(JSON.stringify({ v: 0, type: 'join', room: 'orion', name: 'Pilot2', wire: 'binary' }));
    const first = await welcomeA,
      second = await welcomeB;
    assert.notEqual(first.netId, second.netId);
    const snapshot = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('binary snapshot timeout')), 1500);
      a.on('message', function handler(buffer, isBinary) {
        if (!isBinary) return;
        clearTimeout(timer);
        a.off('message', handler);
        resolve(decodeSnapshot(buffer));
      });
    });
    a.send(Buffer.from(encodeInput({ seq: 1, mask: 1 })));
    const frame = await snapshot;
    assert.equal(frame.players.length, 2);
    assert.ok(frame.players.some((p) => p.id === first.netId));
    assert.ok(frame.players.some((p) => p.id === second.netId));
    assert.equal(frame.players.find((p) => p.id === first.netId).alive, true);
  } finally {
    a?.terminate();
    b?.terminate();
    await connected.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
