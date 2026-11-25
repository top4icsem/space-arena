import test from 'node:test';
import assert from 'node:assert/strict';
import { createShip, integrate, SHIP_PHYSICS } from '../src/sim/ship.js';
import { ARENA, wrapCoordinate, wrapShip } from '../src/sim/arena.js';
import { interpolateShip, lerpAngle, lerpWrapped } from '../src/render/interpolate.js';

const idle = { thrust: false, turnLeft: false, turnRight: false, brake: false };

test('ship begins at the specified location and zero velocity', () => {
  assert.deepEqual(createShip(24, 44), { x: 24, y: 44, vx: 0, vy: 0, angle: 0, thrusting: false });
});

test('integrate is pure and does not mutate the source or the input', () => {
  const ship = Object.freeze(createShip(55, 85));
  const input = Object.freeze({ ...idle, thrust: true });
  const result = integrate(ship, input, 1 / 60);
  assert.notStrictEqual(result, ship);
  assert.equal(ship.y, 85);
  assert.ok(result.y < 85);
});

test('zero timestep leaves the numerical state unchanged', () => {
  const ship = createShip(100, 140);
  const result = integrate(ship, idle, 0);
  assert.deepEqual(result, ship);
});

test('ship accelerates forward (up) when angle is zero', () => {
  const result = integrate(createShip(200, 200), { ...idle, thrust: true }, 1 / 60);
  assert.ok(result.vy < 0);
  assert.ok(Math.abs(result.vx) < 1e-8);
});

test('opposite turn inputs cancel', () => {
  const ship = createShip(100, 100);
  const result = integrate(ship, { ...idle, turnLeft: true, turnRight: true }, 1 / 60);
  assert.equal(result.angle, ship.angle);
});

test('maximum speed is respected under prolonged thrust', () => {
  let ship = createShip(300, 300);
  for (let i = 0; i < 3600; i++) ship = integrate(ship, { ...idle, thrust: true }, 1 / 60);
  assert.ok(Math.hypot(ship.vx, ship.vy) <= SHIP_PHYSICS.maximumSpeed + 1e-8);
});

test('brake reduces velocity faster than ordinary drag', () => {
  const ship = { ...createShip(100, 100), vx: 130, vy: -20 };
  const coast = integrate(ship, idle, 1 / 60);
  const brake = integrate(ship, { ...idle, brake: true }, 1 / 60);
  assert.ok(Math.hypot(brake.vx, brake.vy) < Math.hypot(coast.vx, coast.vy));
});

test('invalid timestep is rejected', () => {
  assert.throws(() => integrate(createShip(0, 0), idle, -1), RangeError);
  assert.throws(() => integrate(createShip(0, 0), idle, Number.NaN), RangeError);
});

test('arena wraps both positive and negative positions', () => {
  assert.equal(wrapCoordinate(-4, 100), 96);
  assert.equal(wrapCoordinate(104, 100), 4);
  assert.equal(wrapCoordinate(0, 100), 0);
  assert.equal(wrapCoordinate(100, 100), 0);
  const wrapped = wrapShip({ ...createShip(-2, ARENA.height + 3) });
  assert.equal(wrapped.x, ARENA.width - 2);
  assert.equal(wrapped.y, 3);
});

test('interpolation takes the shortest route across an arena boundary', () => {
  assert.ok(lerpWrapped(1098, 2, 0.5, 1100) < 1e-6);
  assert.ok(Math.abs(lerpWrapped(2, 1098, 0.5, 1100)) < 1e-6);
});

test('angle interpolation crosses 360 degrees by the short arc', () => {
  const from = (179 * Math.PI) / 180;
  const to = (-179 * Math.PI) / 180;
  assert.ok(Math.abs(Math.abs(lerpAngle(from, to, 0.5)) - Math.PI) < 1e-8);
});

test('interpolated ship has expected position and heading', () => {
  const previous = createShip(10, 20);
  const next = { ...previous, x: 30, y: 50, angle: 0.4 };
  const middle = interpolateShip(previous, next, 0.5);
  assert.equal(middle.x, 20);
  assert.equal(middle.y, 35);
  assert.ok(Math.abs(middle.angle - 0.2) < 1e-8);
});

test('identical input sequences result in identical final states', () => {
  function simulate() {
    let s = createShip(550, 340);
    for (let i = 0; i < 600; i++) {
      s = wrapShip(integrate(s, { ...idle, thrust: i < 400, turnRight: i % 90 < 40 }, 1 / 60));
    }
    return s;
  }
  assert.deepEqual(simulate(), simulate());
});
