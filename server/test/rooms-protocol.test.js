import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { Room, RoomManager } from '../src/rooms.ts';
import { ProtocolError, parseClientMessage } from '../src/protocol.ts';
import { readConfig } from '../src/config.ts';

test('Config validates env integers and log directory', () => {
  assert.equal(readConfig({ PORT: '3001', LOG_DIR: 'logs' }, '/tmp').port, 3001);
  assert.equal(readConfig({ PORT: '3001', LOG_DIR: 'logs' }, '/tmp').logDir, '/tmp/logs');
  assert.throws(() => readConfig({ PORT: 'abc' }), /PORT/);
  assert.throws(() => readConfig({ RATE_PER_SECOND: '-1' }), /RATE_PER_SECOND/);
});
test('Protocol accepts versioned join/chat/leave, rejects invalid shape, oversize and unknown types', () => {
  const valid = parseClientMessage(
    Buffer.from(JSON.stringify({ v: 0, type: 'join', room: 'orion', name: 'Anna' })),
  );
  assert.equal(valid.name, 'Anna');
  assert.equal(parseClientMessage(JSON.stringify({ v: 0, type: 'chat', text: 'Hi' })).text, 'Hi');
  assert.equal(parseClientMessage(JSON.stringify({ v: 0, type: 'leave' })).type, 'leave');
  assert.throws(() => parseClientMessage('oops'), ProtocolError);
  assert.throws(
    () => parseClientMessage(JSON.stringify({ v: 1, type: 'chat', text: 'hi' })),
    ProtocolError,
  );
  assert.throws(
    () => parseClientMessage(JSON.stringify({ v: 0, type: 'coordinates', x: 1 })),
    ProtocolError,
  );
  assert.throws(
    () => parseClientMessage(JSON.stringify({ v: 0, type: 'chat', text: 'hello' }), 10),
    /exceeds/,
  );
  assert.throws(
    () => parseClientMessage(JSON.stringify({ v: 0, type: 'chat', text: '<b>hi</b>', hack: true })),
    ProtocolError,
  );
});
test('Room emits join, chat, leave, empty in order and manager removes empty room', () => {
  const manager = new RoomManager({ seed: false, maxRooms: 2, maxPlayers: 2 });
  const room = manager.create({ id: 'test', name: 'Test' });
  assert.ok(room instanceof Room);
  const calls = [];
  for (const event of ['join', 'chat', 'leave', 'empty']) room.on(event, () => calls.push(event));
  room.join({ id: '1', name: 'A' });
  room.chat({ id: '1' }, 'hello');
  room.leave('1');
  assert.deepEqual(calls, ['join', 'chat', 'leave', 'empty']);
  assert.equal(manager.get('test'), undefined);
});
test('Room caps players and manager caps rooms', () => {
  const manager = new RoomManager({ seed: false, maxRooms: 1, maxPlayers: 1 });
  const room = manager.create({ id: 'a', name: 'A' });
  room.join({ id: '1', name: 'A' });
  assert.throws(() => room.join({ id: '2', name: 'B' }), /full/);
  assert.throws(() => manager.create({ id: 'b', name: 'B' }), /limit/);
});
