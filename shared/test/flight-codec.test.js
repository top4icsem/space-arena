import test from 'node:test';
import assert from 'node:assert/strict';
import { STEP, createShip, advance } from '../flight.js';
import { createRandom } from '../prng.js';
import { SharedWorld } from '../world.js';
import {
  encodeInput,
  decodeInput,
  encodeSnapshot,
  decodeSnapshot,
  controlsToMask,
  maskToControls,
} from '../codec.js';

test('same controls yield bit-identical trajectories with shared browser/Node physics', () => {
  let a = createShip(550, 340),
    b = createShip(550, 340);
  for (let t = 0; t < 300; t++) {
    const controls = { thrust: t < 250, turnLeft: t >= 120 && t < 200, brake: t >= 250 };
    a = advance(a, controls, STEP);
    b = advance(b, controls, STEP);
  }
  assert.deepEqual(a, b);
});
test('PRNG seeded generator produces identical sequences', () => {
  const a = createRandom(9201),
    b = createRandom(9201),
    c = createRandom(9202);
  assert.deepEqual(Array.from({ length: 8 }, a), Array.from({ length: 8 }, b));
  assert.notDeepEqual(Array.from({ length: 5 }, createRandom(9201)), Array.from({ length: 5 }, c));
});
test('DataView input is 7 bytes, LE seq, valid control mask', () => {
  const mask = controlsToMask({ thrust: true, fire: true, guided: true });
  const bytes = encodeInput({ seq: 0x12345678, mask });
  assert.equal(bytes.byteLength, 7);
  assert.deepEqual([...new Uint8Array(bytes)].slice(0, 6), [1, 1, 0x78, 0x56, 0x34, 0x12]);
  assert.deepEqual(decodeInput(bytes), { seq: 0x12345678, mask });
  assert.equal(maskToControls(mask).fire, true);
  assert.throws(() => decodeInput(new Uint8Array([0, 1, 2])), /Bad binary/);
});
test('Snapshot roundtrip retains players, bullets, rocks, pickups, and angle quantization', () => {
  const world = new SharedWorld({ seed: 2026, asteroidCount: 6 });
  world.addPlayer(1);
  world.addPlayer(2);
  world.queueInput(1, { seq: 1, mask: 17 }, maskToControls);
  for (let t = 0; t < 10; t++) world.step();
  const snap = world.snapshot(1),
    packet = encodeSnapshot(snap),
    got = decodeSnapshot(packet);
  assert.equal(got.tick, 10);
  assert.equal(got.ack, 1);
  assert.equal(got.players.length, 2);
  assert.equal(got.asteroids.length, 6);
  assert.equal(got.pickups.length, 1);
  assert.equal(got.bullets.length > 0, true);
  assert.ok(Math.abs(got.players[0].angle - snap.players[0].angle) < 0.0001);
  assert.equal(got.players[0].id, 1);
  assert.throws(() => decodeSnapshot(packet.slice(0, -1)), /length mismatch/);
});
test('Authoritative world is deterministic for identical seed and input seq stream', () => {
  const a = new SharedWorld({ seed: 48 }),
    b = new SharedWorld({ seed: 48 });
  a.addPlayer(1);
  b.addPlayer(1);
  for (let t = 1; t <= 300; t++) {
    const item = { seq: t, mask: t % 4 === 0 ? 17 : t % 3 === 0 ? 5 : 1 };
    a.queueInput(1, item, maskToControls);
    b.queueInput(1, item, maskToControls);
    a.step();
    b.step();
  }
  assert.deepEqual(a.snapshot(300), b.snapshot(300));
});
test('Authoritative world rejects stale input seq and accepts progression without coordinates', () => {
  const game = new SharedWorld({ seed: 83, asteroidCount: 0 });
  game.addPlayer(8);
  assert.equal(game.queueInput(8, { seq: 1, mask: 1 }, maskToControls), true);
  game.step();
  assert.equal(game.queueInput(8, { seq: 1, mask: 1 }, maskToControls), false);
  assert.equal(game.players.get(8).ack, 1);
  assert.ok(game.players.get(8).y < 170);
});
