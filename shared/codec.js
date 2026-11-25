/* Version 1, byte order LITTLE ENDIAN. Text join/chat remains v=0 JSON from Lab 04.
 * Input: [u8 ver, u8 type=1, u32 seq, u8 mask] = 7 bytes.
 * Snapshot header: [u8 ver, u8 type=2, u32 tick, u32 ack, u8 players,
 *                    u16 bullets, u8 rocks]. Then packed records.
 */
export const NET_VERSION = 1;
export const TYPES = Object.freeze({ INPUT: 1, SNAPSHOT: 2 });
export const INPUT_BYTES = 7;
export const HEADER_BYTES = 15;
export const PLAYER_BYTES = 29;
export const BULLET_BYTES = 25;
export const ROCK_BYTES = 12;
export const PICKUP_BYTES = 10;
export const MASK = Object.freeze({ THRUST: 1, LEFT: 2, RIGHT: 4, BRAKE: 8, FIRE: 16, GUIDED: 32 });
export function angleToInt16(angle) {
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  return Math.round((wrapped / Math.PI) * 32767);
}
export function int16ToAngle(value) {
  return (value / 32767) * Math.PI;
}
export function controlsToMask(input) {
  return (
    (input.thrust ? MASK.THRUST : 0) |
    (input.turnLeft ? MASK.LEFT : 0) |
    (input.turnRight ? MASK.RIGHT : 0) |
    (input.brake ? MASK.BRAKE : 0) |
    (input.fire ? MASK.FIRE : 0) |
    (input.guided ? MASK.GUIDED : 0)
  );
}
export function maskToControls(mask) {
  return {
    thrust: Boolean(mask & MASK.THRUST),
    turnLeft: Boolean(mask & MASK.LEFT),
    turnRight: Boolean(mask & MASK.RIGHT),
    brake: Boolean(mask & MASK.BRAKE),
    fire: Boolean(mask & MASK.FIRE),
    guided: Boolean(mask & MASK.GUIDED),
  };
}
export function encodeInput({ seq, mask }) {
  if (
    !Number.isSafeInteger(seq) ||
    seq < 0 ||
    seq > 0xffffffff ||
    !Number.isInteger(mask) ||
    mask < 0 ||
    mask > 63
  )
    throw new RangeError('Invalid input');
  const bytes = new ArrayBuffer(INPUT_BYTES);
  const view = new DataView(bytes);
  view.setUint8(0, NET_VERSION);
  view.setUint8(1, TYPES.INPUT);
  view.setUint32(2, seq, true);
  view.setUint8(6, mask);
  return bytes;
}
function viewOf(data) {
  if (data instanceof ArrayBuffer) return new DataView(data);
  if (ArrayBuffer.isView(data)) return new DataView(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('Expected ArrayBuffer or a view');
}
export function decodeInput(data) {
  const view = viewOf(data);
  if (
    view.byteLength !== INPUT_BYTES ||
    view.getUint8(0) !== NET_VERSION ||
    view.getUint8(1) !== TYPES.INPUT
  )
    throw new Error('Bad binary input');
  const seq = view.getUint32(2, true),
    mask = view.getUint8(6);
  if (mask & ~63) throw new Error('Invalid input flags');
  return { seq, mask };
}
export function encodeSnapshot(frame) {
  const players = frame.players || [],
    bullets = frame.bullets || [],
    asteroids = frame.asteroids || [],
    pickups = frame.pickups || [];
  if (
    players.length > 255 ||
    bullets.length > 65535 ||
    asteroids.length > 255 ||
    pickups.length > 255
  )
    throw new RangeError('Too many entities');
  const buffer = new ArrayBuffer(
    HEADER_BYTES +
      players.length * PLAYER_BYTES +
      bullets.length * BULLET_BYTES +
      asteroids.length * ROCK_BYTES +
      pickups.length * PICKUP_BYTES,
  );
  const v = new DataView(buffer);
  let i = 0;
  const u8 = (x) => {
    v.setUint8(i, x);
    i += 1;
  };
  const u16 = (x) => {
    v.setUint16(i, x, true);
    i += 2;
  };
  const u32 = (x) => {
    v.setUint32(i, x >>> 0, true);
    i += 4;
  };
  const f32 = (x) => {
    v.setFloat32(i, x, true);
    i += 4;
  };
  const i16 = (x) => {
    v.setInt16(i, x, true);
    i += 2;
  };
  u8(NET_VERSION);
  u8(TYPES.SNAPSHOT);
  u32(frame.tick);
  u32(frame.ack ?? 0);
  u8(players.length);
  u16(bullets.length);
  u8(asteroids.length);
  u8(pickups.length);
  for (const p of players) {
    u32(p.id);
    f32(p.x);
    f32(p.y);
    f32(p.vx);
    f32(p.vy);
    i16(angleToInt16(p.angle));
    u8(p.hp);
    u16(p.score);
    u8((p.alive ? 1 : 0) | (p.thrusting ? 2 : 0));
    u16(Math.round(Math.max(0, p.respawn ?? 0) * 1000));
    u8(0); // reserved, fixed player record size 29
  }
  for (const b of bullets) {
    u32(b.id);
    u32(b.ownerId);
    f32(b.x);
    f32(b.y);
    f32(b.vx);
    f32(b.vy);
    u8(b.guided ? 1 : 0);
  }
  for (const a of asteroids) {
    u16(a.id);
    f32(a.x);
    f32(a.y);
    u8(a.radius);
    u8(a.hp | (a.guided ? 128 : 0));
  }
  for (const p of pickups) {
    u16(p.id);
    f32(p.x);
    f32(p.y);
  }
  if (i !== buffer.byteLength)
    throw new Error(`Snapshot packing mismatch ${i} != ${buffer.byteLength}`);
  return buffer;
}
export function decodeSnapshot(data) {
  const v = viewOf(data);
  if (
    v.byteLength < HEADER_BYTES ||
    v.getUint8(0) !== NET_VERSION ||
    v.getUint8(1) !== TYPES.SNAPSHOT
  )
    throw new Error('Bad binary snapshot');
  let i = 2;
  const u8 = () => {
    const x = v.getUint8(i);
    i += 1;
    return x;
  };
  const u16 = () => {
    const x = v.getUint16(i, true);
    i += 2;
    return x;
  };
  const u32 = () => {
    const x = v.getUint32(i, true);
    i += 4;
    return x;
  };
  const f32 = () => {
    const x = v.getFloat32(i, true);
    i += 4;
    return x;
  };
  const i16 = () => {
    const x = v.getInt16(i, true);
    i += 2;
    return x;
  };
  const tick = u32(),
    ack = u32(),
    pCount = u8(),
    bCount = u16(),
    aCount = u8(),
    pickupCount = u8();
  const expected =
    HEADER_BYTES +
    pCount * PLAYER_BYTES +
    bCount * BULLET_BYTES +
    aCount * ROCK_BYTES +
    pickupCount * PICKUP_BYTES;
  if (v.byteLength !== expected) throw new Error('Snapshot length mismatch');
  const players = [];
  for (let j = 0; j < pCount; j++) {
    const id = u32(),
      x = f32(),
      y = f32(),
      vx = f32(),
      vy = f32(),
      angle = int16ToAngle(i16()),
      hp = u8(),
      score = u16(),
      flags = u8(),
      respawn = u16() / 1000;
    u8();
    players.push({
      id,
      x,
      y,
      vx,
      vy,
      angle,
      hp,
      score,
      alive: Boolean(flags & 1),
      thrusting: Boolean(flags & 2),
      respawn,
    });
  }
  const bullets = [];
  for (let j = 0; j < bCount; j++)
    bullets.push({
      id: u32(),
      ownerId: u32(),
      x: f32(),
      y: f32(),
      vx: f32(),
      vy: f32(),
      guided: Boolean(u8()),
    });
  const asteroids = [];
  for (let j = 0; j < aCount; j++) {
    const id = u16(),
      x = f32(),
      y = f32(),
      radius = u8(),
      packed = u8();
    asteroids.push({ id, x, y, radius, hp: packed & 127, guided: Boolean(packed & 128) });
  }
  const pickups = [];
  for (let j = 0; j < pickupCount; j++) pickups.push({ id: u16(), x: f32(), y: f32() });
  return { tick, ack, players, bullets, asteroids, pickups };
}
