import test from 'node:test';
import assert from 'node:assert/strict';
import { SocketConnection } from '../src/network/connection.js';

class FakeSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static sockets = [];
  constructor(url) {
    super();
    this.url = url;
    this.readyState = FakeSocket.CONNECTING;
    this.sent = [];
    FakeSocket.sockets.push(this);
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  receive(message) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
  close(code = 1000, reason = '') {
    this.readyState = FakeSocket.CLOSED;
    const event = new Event('close');
    Object.assign(event, { code, reason });
    this.dispatchEvent(event);
  }
}

test('Connection sends join first, buffers chat and flushes on acknowledgement', async () => {
  FakeSocket.sockets.length = 0;
  const connection = new SocketConnection({ url: 'ws://local/ws', WebSocketImpl: FakeSocket });
  const promise = connection.join('Anna', 'orion');
  const socket = FakeSocket.sockets.at(-1);
  assert.equal(connection.send('chat', { text: 'buffered' }), true);
  socket.open();
  assert.deepEqual(
    socket.sent.map((msg) => msg.type),
    ['join'],
  );
  socket.receive({ v: 0, type: 'joined', room: 'orion', name: 'Anna' });
  assert.equal((await promise).room, 'orion');
  assert.deepEqual(
    socket.sent.map((msg) => msg.type),
    ['join', 'chat'],
  );
  connection.disconnect();
  assert.equal(connection.queue.length, 0);
});

test('Connection rejects an unsuccessful join and stops reconnecting', async () => {
  FakeSocket.sockets.length = 0;
  const connection = new SocketConnection({ url: 'ws://local/ws', WebSocketImpl: FakeSocket });
  const join = connection.join('Anna', 'missing');
  const socket = FakeSocket.sockets.at(-1);
  socket.open();
  socket.close(1008, 'Unknown room');
  await assert.rejects(join, /1008/);
  assert.equal(connection.status, 'disconnected');
});
