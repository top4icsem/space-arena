import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ARENA,
  STEP,
  advance,
  advanceInto,
  createShip,
  integrate,
  wrapCoordinate,
} from '../flight.ts';
import { entityId, inputSeq, stepId, selectKind, entityLabel } from '../types.ts';
import { ObjectPool } from '../pool.ts';
import { SharedWorld } from '../world.ts';
import { createRandom } from '../prng.ts';
import {
  NET_VERSION,
  TYPES,
  INPUT_BYTES,
  HEADER_BYTES,
  PLAYER_BYTES,
  BULLET_BYTES,
  ROCK_BYTES,
  PICKUP_BYTES,
  controlsToMask,
  maskToControls,
  encodeInput,
  decodeInput,
  encodeSnapshot,
  decodeSnapshot,
  angleToInt16,
  int16ToAngle,
} from '../codec.ts';
import { parseClientMessage, ProtocolError } from '../../server/src/protocol.ts';

const positive = [0, 1, 2, 4, 7, 8, 17, 32, 63, 127, 255, 512];
const unit = createShip(500, 300);
const sample = () => {
  const world = new SharedWorld({ seed: 9, asteroidCount: 3 });
  world.addPlayer(entityId(101));
  world.addPlayer(entityId(102));
  world.queueInput(entityId(101), { seq: inputSeq(1), mask: 17 }, maskToControls);
  world.step();
  return world.snapshot();
};

describe('Lab07: shared value types, vectors and integration', () => {
  it.each(positive)('wrapCoordinate keeps %i in arena', (x) => {
    expect(wrapCoordinate(x, ARENA.width)).toBeGreaterThanOrEqual(0);
    expect(wrapCoordinate(x, ARENA.width)).toBeLessThan(ARENA.width);
  });
  it.each([-9900, -1101, -1100, -1099, -5, -1, 0, 1099, 1100, 1101, 99999])(
    'wrap handles negative/big %i',
    (x) => {
      const v = wrapCoordinate(x, ARENA.width);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(ARENA.width);
      expect(wrapCoordinate(v, ARENA.width)).toBe(v);
    },
  );
  it.each([
    {},
    { thrust: true },
    { brake: true },
    { turnLeft: true },
    { turnRight: true },
    { thrust: true, turnLeft: true },
    { thrust: true, brake: true },
  ])('advanceInto numerically matches pure advance for %o', (controls) => {
    const state = advance(unit, controls, STEP);
    const actual = { ...unit };
    expect(advanceInto(actual, actual, controls, STEP)).toBe(actual);
    expect(actual).toEqual(state);
    expect(unit).toEqual(createShip(500, 300));
  });
  it('rejects negative time in pure and mutable integration', () => {
    expect(() => integrate(unit, {}, -1)).toThrow(RangeError);
    expect(() => advanceInto({ ...unit }, unit, {}, -1)).toThrow(RangeError);
  });
  it.each([0, 1, 100, 255, 1024, 65535, 999999])('branded IDs validate %i', (v) => {
    expect(entityId(v)).toBe(v);
    expect(stepId(v)).toBe(v);
    expect(inputSeq(v)).toBe(v);
  });
  it.each([-1, -5, 0.1, NaN, Infinity, 4294967296])('branded ID rejects %s', (v) => {
    expect(() => entityId(v)).toThrow();
    expect(() => inputSeq(v)).toThrow();
  });
  it('object pool reuses identity within capacity', () => {
    let count = 0;
    const pool = new ObjectPool(() => ({ n: ++count }), 1);
    const a = pool.acquire();
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    expect(count).toBe(1);
    pool.release(a);
    pool.release({ n: 99 });
    expect(pool.available).toBe(1);
    expect(() => new ObjectPool(() => 1, -1)).toThrow(RangeError);
  });
  it('seeded RNG repeats bit-identical values', () => {
    const a = createRandom(414),
      b = createRandom(414);
    for (let i = 0; i < 200; i++) expect(a()).toBe(b());
  });
});

describe('Lab07: binary codec and runtime contract', () => {
  it.each(positive.filter((n) => n < 64))('roundtrips mask %i', (mask) => {
    const decoded = decodeInput(encodeInput({ seq: inputSeq(55), mask }));
    expect(decoded).toEqual({ seq: 55, mask });
    expect(controlsToMask(maskToControls(mask))).toBe(mask);
  });
  it.each([-1, 64, 128, 256])('invalid mask %i throws', (mask) => {
    expect(() => encodeInput({ seq: inputSeq(1), mask })).toThrow();
  });
  it('length metadata matches actual encoded snapshot', () => {
    const s = sample();
    expect(encodeSnapshot(s).byteLength).toBe(
      HEADER_BYTES +
        s.players.length * PLAYER_BYTES +
        s.bullets.length * BULLET_BYTES +
        s.asteroids.length * ROCK_BYTES +
        s.pickups.length * PICKUP_BYTES,
    );
  });
  it('snapshot retains entity kinds, order and quantized angles', () => {
    const s = sample(),
      copy = decodeSnapshot(encodeSnapshot(s));
    expect(copy.players.map((p) => p.kind)).toEqual(s.players.map((p) => p.kind));
    expect(copy.players.map((p) => p.id)).toEqual(s.players.map((p) => p.id));
    expect(copy.asteroids.map((p) => p.id)).toEqual(s.asteroids.map((p) => p.id));
    expect(copy.ack).toBe(s.ack);
    expect(copy.tick).toBe(s.tick);
    for (let i = 0; i < s.players.length; i++) {
      expect(Math.abs(copy.players[i]!.angle - s.players[i]!.angle)).toBeLessThan(
        Math.PI / 32767 + 1e-7,
      );
    }
  });
  it.each([0, 1, 2, 5, 6, 8, 9])('malformed frame length %i is rejected', (n) => {
    expect(() => decodeInput(new Uint8Array(n))).toThrow();
    expect(() => decodeSnapshot(new Uint8Array(n))).toThrow();
  });
  it('wrong version and type rejected', () => {
    const data = new Uint8Array(encodeInput({ seq: inputSeq(9), mask: 1 }));
    expect(data.byteLength).toBe(INPUT_BYTES);
    data[0] = NET_VERSION + 1;
    expect(() => decodeInput(data)).toThrow();
    data[0] = NET_VERSION;
    data[1] = TYPES.SNAPSHOT;
    expect(() => decodeInput(data)).toThrow();
  });
  it('invalid network JSON is converted to ProtocolError', () => {
    expect(() => parseClientMessage('{bad')).toThrow(ProtocolError);
    expect(() => parseClientMessage('{"v":0,"type":"walk"}')).toThrow(ProtocolError);
    expect(() => parseClientMessage('x'.repeat(4096), 2048)).toThrow(ProtocolError);
  });
  it.each(['join', 'chat', 'input', 'probe', 'leave'])('discriminator accepts valid %s', (type) => {
    const map = {
      join: { room: 'orion', name: 'Pilot' },
      chat: { text: 'Hi' },
      input: { seq: 1, mask: 3 },
      probe: { sent: 100 },
      leave: {},
    };
    const valid = JSON.stringify({ v: 0, type, ...map[type as keyof typeof map] });
    expect(parseClientMessage(valid).type).toBe(type);
  });
  it('selectKind and label maintain discriminated entity data', () => {
    const s = sample(),
      entities = [...s.players, ...s.asteroids, ...s.pickups];
    expect(selectKind(entities, 'ship').length).toBe(2);
    expect(entities.every((e) => entityLabel(e).length > 4)).toBe(true);
  });
});

describe('Lab07: shared simulation and collisions', () => {
  it.each([0, 1, 2, 4, 8, 16])('asteroid startup count %i', (count) => {
    const world = new SharedWorld({ seed: 123, asteroidCount: count });
    expect(world.asteroids.length).toBe(count);
    expect(world.pickups.length).toBe(1);
  });
  it('identical inputs reproduce identical snapshots for 90 ticks', () => {
    const a = new SharedWorld({ seed: 824, asteroidCount: 4 }),
      b = new SharedWorld({ seed: 824, asteroidCount: 4 });
    for (const w of [a, b]) w.addPlayer(entityId(123));
    for (let tick = 1; tick <= 90; tick++) {
      const mask = (tick % 2 ? 1 : 4) | (tick % 7 === 0 ? 16 : 0);
      for (const w of [a, b])
        w.queueInput(entityId(123), { seq: inputSeq(tick), mask }, maskToControls);
      expect(a.step()).toEqual(b.step());
      expect(a.snapshot()).toEqual(b.snapshot());
    }
  });
  it('does not accept stale or duplicate input seq', () => {
    const w = new SharedWorld({ asteroidCount: 0 }),
      id = entityId(1);
    w.addPlayer(id);
    expect(w.queueInput(id, { seq: inputSeq(1), mask: 1 }, maskToControls)).toBe(true);
    expect(w.queueInput(id, { seq: inputSeq(1), mask: 1 }, maskToControls)).toBe(false);
    w.step();
    expect(w.queueInput(id, { seq: inputSeq(1), mask: 1 }, maskToControls)).toBe(false);
    expect(w.queueInput(entityId(44), { seq: inputSeq(1), mask: 1 }, maskToControls)).toBe(false);
  });
  it('ship remains inside arena with repeated motion', () => {
    const w = new SharedWorld({ seed: 1, asteroidCount: 0 }),
      id = entityId(7);
    w.addPlayer(id);
    for (let t = 1; t <= 1200; t++) {
      w.queueInput(id, { seq: inputSeq(t), mask: t % 3 === 0 ? 5 : 1 }, maskToControls);
      w.step();
      const p = w.players.get(id)!;
      expect(p.x >= 0 && p.x < ARENA.width && p.y >= 0 && p.y < ARENA.height).toBe(true);
    }
  });
  it('bullets expire and their objects return to pool', () => {
    const w = new SharedWorld({ seed: 1, asteroidCount: 0 }),
      id = entityId(7);
    const p = w.addPlayer(id);
    p.invincible = 0;
    w.queueInput(id, { seq: inputSeq(1), mask: 16 }, maskToControls);
    w.step();
    expect(w.bullets.length).toBe(1);
    for (let i = 0; i < 50; i++) w.step();
    expect(w.bulletPool.available).toBeGreaterThan(0);
  });
  it('pickup adds score and health without invalidating other entities', () => {
    const w = new SharedWorld({ asteroidCount: 0 }),
      id = entityId(2),
      p = w.addPlayer(id);
    p.hp = 2;
    w.pickups[0]!.x = p.x;
    w.pickups[0]!.y = p.y;
    const events = w.step();
    expect(events.some((e) => e.type === 'collected')).toBe(true);
    expect(p.hp).toBe(3);
    expect(p.score).toBe(100);
  });
  it('player asteroid collision consumes health', () => {
    const w = new SharedWorld({ seed: 2, asteroidCount: 1 }),
      id = entityId(2),
      p = w.addPlayer(id),
      rock = w.asteroids[0]!;
    p.invincible = 0;
    rock.x = p.x;
    rock.y = p.y;
    rock.vx = rock.vy = 0;
    const events = w.step();
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    expect(p.hp).toBe(2);
  });
  it('respawns after 2 seconds', () => {
    const w = new SharedWorld({ asteroidCount: 0 }),
      p = w.addPlayer(entityId(3));
    p.alive = false;
    p.respawn = 2;
    p.hp = 0;
    for (let i = 0; i < 65; i++) w.step();
    expect(p.alive).toBe(true);
    expect(p.hp).toBe(3);
  });
  it('removing a player prevents further movement', () => {
    const w = new SharedWorld({ asteroidCount: 0 }),
      id = entityId(7);
    w.addPlayer(id);
    w.removePlayer(id);
    w.step();
    expect(w.players.has(id)).toBe(false);
  });
  it('ack reflects accepted input only', () => {
    const w = new SharedWorld({ asteroidCount: 0 }),
      id = entityId(7);
    w.addPlayer(id);
    w.queueInput(id, { seq: inputSeq(44), mask: 1 }, maskToControls);
    w.step();
    expect(w.snapshot(w.players.get(id)!.ack).ack).toBe(44);
  });
});

describe('Lab07 fast-check properties (6 independent properties)', () => {
  it('property 1: input encode/decode roundtrips', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 0xffffffff }),
        fc.integer({ min: 0, max: 63 }),
        (seq, mask) => {
          expect(decodeInput(encodeInput({ seq: inputSeq(seq), mask }))).toEqual({ seq, mask });
        },
      ),
      { numRuns: 100, seed: 7001 },
    );
  });
  it('property 2: packet length agrees with metadata', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 80 }),
        (rocks, frames) => {
          const w = new SharedWorld({ seed: frames, asteroidCount: rocks });
          w.addPlayer(entityId(1));
          for (let i = 0; i < frames; i++) w.step();
          const s = w.snapshot(),
            bytes = encodeSnapshot(s);
          expect(bytes.byteLength).toBe(
            HEADER_BYTES +
              s.players.length * PLAYER_BYTES +
              s.bullets.length * BULLET_BYTES +
              s.asteroids.length * ROCK_BYTES +
              s.pickups.length * PICKUP_BYTES,
          );
        },
      ),
      { numRuns: 90, seed: 7002 },
    );
  });
  it('property 3: bad buffer always throws without killing process', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 128 }), (bytes) => {
        if (
          bytes.byteLength === INPUT_BYTES &&
          bytes[0] === NET_VERSION &&
          bytes[1] === TYPES.INPUT &&
          (bytes[6] ?? 0) < 64
        )
          return;
        expect(() => decodeInput(bytes)).toThrow();
      }),
      { numRuns: 200, seed: 7003 },
    );
  });
  it('property 4: every ship stays in the arena under valid input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 63 }), { minLength: 1, maxLength: 70 }),
        (masks) => {
          const w = new SharedWorld({ asteroidCount: 0 }),
            id = entityId(19);
          w.addPlayer(id);
          masks.forEach((mask, i) => {
            w.queueInput(id, { seq: inputSeq(i + 1), mask }, maskToControls);
            w.step();
            const p = w.players.get(id)!;
            expect(p.x >= 0 && p.x < ARENA.width && p.y >= 0 && p.y < ARENA.height).toBe(true);
          });
        },
      ),
      { numRuns: 100, seed: 7004 },
    );
  });
  it('property 5: valid messages accepted, corrupted rejected', () => {
    fc.assert(
      fc.property(
        fc
          .array(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
            { minLength: 1, maxLength: 20 },
          )
          .map((chars) => chars.join('')),
        (name) => {
          const json = JSON.stringify({ v: 0, type: 'join', name, room: 'orion' });
          expect(parseClientMessage(json).type).toBe('join');
          expect(() => parseClientMessage(json.slice(0, -1))).toThrow(ProtocolError);
        },
      ),
      { numRuns: 60, seed: 7005 },
    );
  });
  it('property 6: angle quantization bounded by 1 LSB', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true, noDefaultInfinity: true }),
        (angle) => {
          expect(Math.abs(int16ToAngle(angleToInt16(angle)) - angle)).toBeLessThanOrEqual(
            Math.PI / 32767 + 1e-9,
          );
        },
      ),
      { numRuns: 100, seed: 7006 },
    );
  });
  it('property 7: optimized integration preserves original result', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 63 }),
        (dt, mask) => {
          const state = createShip(999, 650),
            controls = maskToControls(mask);
          const copy = { ...state };
          advanceInto(copy, copy, controls, dt);
          expect(copy).toEqual(advance(state, controls, dt));
        },
      ),
      { numRuns: 120, seed: 7007 },
    );
  });
});
