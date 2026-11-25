export const VERSION = 0;
export const CLOSE = Object.freeze({
  INVALID: 1008,
  OVERSIZE: 1009,
  RATE: 1008,
  JOIN_TIMEOUT: 1008,
  SERVER: 1011,
});
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);
const only = (obj, keys) => Object.keys(obj).every((key) => keys.includes(key));
const text = (v, min, max) =>
  typeof v === 'string' &&
  v.trim().length >= min &&
  v.length <= max &&
  !Array.from(v).some((c) => c.charCodeAt(0) <= 31 || c.charCodeAt(0) === 127);
export function parseClientMessage(input, maxBytes = 2048) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.byteLength > maxBytes)
    throw new ProtocolError('Payload exceeds byte cap', CLOSE.OVERSIZE);
  let msg;
  try {
    msg = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ProtocolError('Invalid JSON', CLOSE.INVALID);
  }
  if (!plain(msg) || msg.v !== VERSION || !text(msg.type, 1, 32))
    throw new ProtocolError('Invalid envelope or version');
  if (
    msg.type === 'join' &&
    only(msg, ['v', 'type', 'room', 'name', 'wire']) &&
    text(msg.room, 1, 40) &&
    text(msg.name, 1, 20) &&
    (msg.wire === undefined || ['binary', 'json'].includes(msg.wire))
  )
    return msg;
  if (msg.type === 'chat' && only(msg, ['v', 'type', 'text']) && text(msg.text, 1, 300)) return msg;
  if (
    msg.type === 'input' &&
    only(msg, ['v', 'type', 'seq', 'mask']) &&
    Number.isInteger(msg.seq) &&
    msg.seq >= 1 &&
    msg.seq <= 0xffffffff &&
    Number.isInteger(msg.mask) &&
    msg.mask >= 0 &&
    msg.mask <= 63
  )
    return msg;
  if (
    msg.type === 'probe' &&
    only(msg, ['v', 'type', 'sent']) &&
    typeof msg.sent === 'number' &&
    Number.isFinite(msg.sent) &&
    msg.sent >= 0 &&
    msg.sent < 1e12
  )
    return msg;
  if (msg.type === 'leave' && only(msg, ['v', 'type'])) return msg;
  throw new ProtocolError(`Unknown or malformed type: ${msg.type}`);
}
export class ProtocolError extends Error {
  constructor(message, code = CLOSE.INVALID) {
    super(message);
    this.name = 'ProtocolError';
    this.closeCode = code;
  }
}
export const sendable = (type, fields = {}) => JSON.stringify({ v: VERSION, type, ...fields });
