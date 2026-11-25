import type { ArenaSize, Controls, FlightState } from './types.ts';

export const SHIP_PHYSICS = Object.freeze({
  acceleration: 315,
  rotationRate: Math.PI * 0.93,
  drag: 0.44,
  brakeDrag: 3.8,
  maximumSpeed: 385,
});
export const ARENA: ArenaSize = Object.freeze({ width: 1100, height: 680 });
export const STEP = 1 / 30;
export function createShip(x: number, y: number): FlightState {
  return { x, y, vx: 0, vy: 0, angle: 0, thrusting: false };
}
export function wrapCoordinate(value: number, size: number): number {
  return ((value % size) + size) % size;
}
export function wrapShip(ship: FlightState, arena: ArenaSize = ARENA): FlightState {
  return {
    ...ship,
    x: wrapCoordinate(ship.x, arena.width),
    y: wrapCoordinate(ship.y, arena.height),
  };
}
/** Pure integration; fixed-step and exactly the same formulas as Lab 05. */
export function integrate(ship: FlightState, input: Controls, dt: number): FlightState {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid dt');
  const direction = Number(Boolean(input.turnRight)) - Number(Boolean(input.turnLeft));
  const angle = ship.angle + direction * SHIP_PHYSICS.rotationRate * dt;
  const thrusting = Boolean(input.thrust);
  const acceleration = thrusting ? SHIP_PHYSICS.acceleration : 0;
  let vx = ship.vx + Math.sin(angle) * acceleration * dt;
  let vy = ship.vy - Math.cos(angle) * acceleration * dt;
  const damping = Math.exp(-(input.brake ? SHIP_PHYSICS.brakeDrag : SHIP_PHYSICS.drag) * dt);
  vx *= damping;
  vy *= damping;
  const speed = Math.hypot(vx, vy);
  if (speed > SHIP_PHYSICS.maximumSpeed) {
    const scale = SHIP_PHYSICS.maximumSpeed / speed;
    vx *= scale;
    vy *= scale;
  }
  return {
    x: ship.x + vx * dt,
    y: ship.y + vy * dt,
    vx,
    vy,
    angle: Math.atan2(Math.sin(angle), Math.cos(angle)),
    thrusting,
  };
}
export function advance(
  ship: FlightState,
  controls: Controls,
  dt = STEP,
  arena: ArenaSize = ARENA,
): FlightState {
  return wrapShip(integrate(ship, controls, dt), arena);
}

/** Zero-allocation integration for the server hot path. Pure `advance` remains for replay. */
export function advanceInto<
  T extends { x: number; y: number; vx: number; vy: number; angle: number; thrusting: boolean },
>(output: T, ship: FlightState, input: Controls, dt = STEP, arena: ArenaSize = ARENA): T {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid dt');
  const direction = Number(Boolean(input.turnRight)) - Number(Boolean(input.turnLeft));
  const angle = ship.angle + direction * SHIP_PHYSICS.rotationRate * dt;
  const thrusting = Boolean(input.thrust);
  const acceleration = thrusting ? SHIP_PHYSICS.acceleration : 0;
  let vx = ship.vx + Math.sin(angle) * acceleration * dt;
  let vy = ship.vy - Math.cos(angle) * acceleration * dt;
  const damping = Math.exp(-(input.brake ? SHIP_PHYSICS.brakeDrag : SHIP_PHYSICS.drag) * dt);
  vx *= damping;
  vy *= damping;
  const speed = Math.hypot(vx, vy);
  if (speed > SHIP_PHYSICS.maximumSpeed) {
    const scale = SHIP_PHYSICS.maximumSpeed / speed;
    vx *= scale;
    vy *= scale;
  }
  // Compute all outputs before writing: output === ship is supported.
  const x = wrapCoordinate(ship.x + vx * dt, arena.width);
  const y = wrapCoordinate(ship.y + vy * dt, arena.height);
  const heading = Math.atan2(Math.sin(angle), Math.cos(angle));
  output.x = x;
  output.y = y;
  output.vx = vx;
  output.vy = vy;
  output.angle = heading;
  output.thrusting = thrusting;
  return output;
}
