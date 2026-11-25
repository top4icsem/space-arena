import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMessage, ProtocolError } from '../src/protocol.ts';
import { readConfig } from '../src/config.ts';

test('Zod rejects bad JSON, unknown types and extra fields at the WebSocket boundary', () => {
  assert.throws(() => parseClientMessage('{broken'), ProtocolError);
  assert.throws(() => parseClientMessage('{"v":0,"type":"teleport","x":100}'), ProtocolError);
  assert.throws(
    () => parseClientMessage('{"v":0,"type":"chat","text":"Hi","hack":true}'),
    ProtocolError,
  );
  assert.throws(
    () => parseClientMessage('{"v":0,"type":"input","seq":1,"mask":255}'),
    ProtocolError,
  );
});
test('Zod accepts the validated shape and preserves tagged type', () => {
  const message = parseClientMessage(JSON.stringify({ v: 0, type: 'input', seq: 7, mask: 17 }));
  if (message.type !== 'input') throw new Error('Expected input');
  assert.equal(message.seq, 7);
  assert.equal(message.mask, 17);
});
test('Zod validates environment config before startup', () => {
  assert.equal(readConfig({ PORT: '3300' }).port, 3300);
  assert.throws(() => readConfig({ PORT: '-5' }), /PORT/);
});
