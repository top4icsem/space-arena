import { entityId, inputSeq, stepId } from './types.ts';
import type {
  Controls,
  Snapshot,
  WireInput,
  PlayerRecord,
  BulletRecord,
  AsteroidRecord,
  PickupRecord,
} from './types.ts';

export const NET_VERSION = 1;
export const TYPES = Object.freeze({ INPUT: 1, SNAPSHOT: 2 });
export const INPUT_BYTES = 7;
export const HEADER_BYTES = 15;
export const PLAYER_BYTES = 29;
export const BULLET_BYTES = 25;
export const ROCK_BYTES = 12;
export const PICKUP_BYTES = 10;
export const MASK = Object.freeze({ THRUST: 1, LEFT: 2, RIGHT: 4, BRAKE: 8, FIRE: 16, GUIDED: 32 });
export function angleToInt16(angle: number): number {
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  return Math.round((wrapped / Math.PI) * 32767);
}
export function int16ToAngle(value: number): number {
  return (value / 32767) * Math.PI;
}
export function controlsToMask(input: Controls): number {
  return (
    (input.thrust ? MASK.THRUST : 0) |
    (input.turnLeft ? MASK.LEFT : 0) |
    (input.turnRight ? MASK.RIGHT : 0) |
    (input.brake ? MASK.BRAKE : 0) |
    (input.fire ? MASK.FIRE : 0) |
    (input.guided ? MASK.GUIDED : 0)
  );
}
export function maskToControls(mask: number): Required<Controls> {
  if (!Number.isInteger(mask) || mask < 0 || mask > 63)
    throw new RangeError('Invalid control mask');
  return {
    thrust: Boolean(mask & MASK.THRUST),
    turnLeft: Boolean(mask & MASK.LEFT),
    turnRight: Boolean(mask & MASK.RIGHT),
    brake: Boolean(mask & MASK.BRAKE),
    fire: Boolean(mask & MASK.FIRE),
    guided: Boolean(mask & MASK.GUIDED),
  };
}
export function encodeInput({ seq, mask }: WireInput): ArrayBuffer {
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
function viewOf(data: ArrayBuffer | ArrayBufferView): DataView {
  if (data instanceof ArrayBuffer) return new DataView(data);
  if (ArrayBuffer.isView(data)) return new DataView(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('Expected ArrayBuffer or a view');
}
export function decodeInput(data: ArrayBuffer | ArrayBufferView): WireInput {
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
  return { seq: inputSeq(seq), mask };
}
export function encodeSnapshot(frame: Snapshot): ArrayBuffer {
  const { players, bullets, asteroids, pickups } = frame;
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
  const u8 = (x: number) => {
    v.setUint8(i, x);
    i += 1;
  };
  const u16 = (x: number) => {
    v.setUint16(i, x, true);
    i += 2;
  };
  const u32 = (x: number) => {
    v.setUint32(i, x >>> 0, true);
    i += 4;
  };
  const f32 = (x: number) => {
    v.setFloat32(i, x, true);
    i += 4;
  };
  const i16 = (x: number) => {
    v.setInt16(i, x, true);
    i += 2;
  };
  u8(NET_VERSION);
  u8(TYPES.SNAPSHOT);
  u32(frame.tick);
  u32(frame.ack);
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
    u16(Math.round(Math.max(0, p.respawn) * 1000));
    u8(0);
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
export function decodeSnapshot(data: ArrayBuffer | ArrayBufferView): Snapshot {
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
  const tick = stepId(u32()),
    ack = inputSeq(u32()),
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
  const players: PlayerRecord[] = [];
  for (let j = 0; j < pCount; j++) {
    const id = entityId(u32()),
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
      kind: 'ship',
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
  const bullets: BulletRecord[] = [];
  for (let j = 0; j < bCount; j++)
    bullets.push({
      kind: 'bullet',
      id: entityId(u32()),
      ownerId: entityId(u32()),
      x: f32(),
      y: f32(),
      vx: f32(),
      vy: f32(),
      guided: Boolean(u8()),
    });
  const asteroids: AsteroidRecord[] = [];
  for (let j = 0; j < aCount; j++) {
    const id = entityId(u16()),
      x = f32(),
      y = f32(),
      radius = u8(),
      packed = u8();
    asteroids.push({
      kind: 'asteroid',
      id,
      x,
      y,
      radius,
      hp: packed & 127,
      guided: Boolean(packed & 128),
    });
  }
  const pickups: PickupRecord[] = [];
  for (let j = 0; j < pickupCount; j++)
    pickups.push({ kind: 'pickup', id: entityId(u16()), x: f32(), y: f32() });
  // Defensive decoder: reject NaN/Infinity even when the buffer length and version were correct.
  for (const item of [...players, ...bullets, ...asteroids, ...pickups]) {
    if (
      !Number.isFinite(item.x) ||
      !Number.isFinite(item.y) ||
      item.x < 0 ||
      item.x > 1100 ||
      item.y < 0 ||
      item.y > 680
    )
      throw new Error('Snapshot coordinate out of range');
  }
  for (const p of players)
    if (![p.vx, p.vy, p.angle].every(Number.isFinite))
      throw new Error('Invalid player velocity/angle');
  for (const b of bullets)
    if (![b.vx, b.vy].every(Number.isFinite)) throw new Error('Invalid bullet velocity');
  return { tick, ack, players, bullets, asteroids, pickups };
}
