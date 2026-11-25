/** Browser/Node identical movement function. No DOM, Node, wall-clock or randomness. */
export const SHIP_PHYSICS = Object.freeze({
  acceleration: 315,
  rotationRate: Math.PI * 0.93,
  drag: 0.44,
  brakeDrag: 3.8,
  maximumSpeed: 385,
});
export const ARENA = Object.freeze({ width: 1100, height: 680 });
export const STEP = 1 / 30;
export function createShip(x, y) {
  return { x, y, vx: 0, vy: 0, angle: 0, thrusting: false };
}
export function wrapCoordinate(value, size) {
  return ((value % size) + size) % size;
}
export function wrapShip(ship, arena = ARENA) {
  return {
    ...ship,
    x: wrapCoordinate(ship.x, arena.width),
    y: wrapCoordinate(ship.y, arena.height),
  };
}
export function integrate(ship, input, dt) {
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
export function advance(ship, controls, dt = STEP, arena = ARENA) {
  return wrapShip(integrate(ship, controls, dt), arena);
}
