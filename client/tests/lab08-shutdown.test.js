import test from 'node:test';
import assert from 'node:assert/strict';
import { SocketConnection } from '../src/network/connection.ts';

class FakeSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static latest = null;
  readyState = FakeSocket.CONNECTING;
  sent = [];
  bufferedAmount = 0;
  constructor() {
    super();
    FakeSocket.latest = this;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }
  send(data) {
    this.sent.push(JSON.parse(String(data)));
  }
  receive(json) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(json) }));
  }
  close(code = 1000, reason = '') {
    this.readyState = FakeSocket.CLOSED;
    const event = new Event('close');
    Object.assign(event, { code, reason });
    this.dispatchEvent(event);
  }
}

test('Lab 08: maintenance shutdown redirects the client and prevents reconnection', async () => {
  const connection = new SocketConnection({ url: 'ws://localhost/ws', WebSocketImpl: FakeSocket });
  const joined = connection.join('Pilot', 'orion');
  const socket = FakeSocket.latest;
  socket.open();
  socket.receive({ v: 0, type: 'joined', room: 'orion', name: 'Pilot' });
  await joined;
  let count = 0;
  connection.addEventListener('shutdown', () => {
    count++;
  });
  socket.receive({ v: 0, type: 'shutdown', reason: 'Server maintenance' });
  socket.close(1001, 'Server shutting down');
  assert.equal(count, 1);
  assert.equal(connection.status, 'disconnected');
  assert.equal(connection.timer, null);
});

test('Lab 08: abrupt server disappearance emits shutdown and stops retrying', async () => {
  const connection = new SocketConnection({ url: 'ws://localhost/ws', WebSocketImpl: FakeSocket });
  const joined = connection.join('Pilot', 'nebula');
  const socket = FakeSocket.latest;
  socket.open();
  socket.receive({ v: 0, type: 'joined', room: 'nebula', name: 'Pilot' });
  await joined;
  let count = 0;
  connection.addEventListener('shutdown', () => {
    count++;
  });
  socket.close(1006, 'Disconnected');
  assert.equal(count, 1);
  assert.equal(connection.status, 'disconnected');
  assert.equal(connection.timer, null);
});
