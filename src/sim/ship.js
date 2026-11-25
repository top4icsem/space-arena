/** The simulation has no references to DOM, Canvas, or wall-clock time. */
export const SHIP_PHYSICS = Object.freeze({
  acceleration: 315,
  rotationRate: Math.PI * 0.93,
  drag: 0.44,
  brakeDrag: 3.8,
  maximumSpeed: 385,
});

export function createShip(x, y) {
  return { x, y, vx: 0, vy: 0, angle: 0, thrusting: false };
}

/** Pure: does not mutate ship or input, and always produces a new state. */
export function integrate(ship, input, dt) {
  if (!Number.isFinite(dt) || dt < 0) {
    throw new RangeError('dt must be a non-negative finite number');
  }

  const direction = Number(Boolean(input.turnRight)) - Number(Boolean(input.turnLeft));
  const angle = ship.angle + direction * SHIP_PHYSICS.rotationRate * dt;
  const thrusting = Boolean(input.thrust);
  const acceleration = thrusting ? SHIP_PHYSICS.acceleration : 0;

  let vx = ship.vx + Math.sin(angle) * acceleration * dt;
  let vy = ship.vy - Math.cos(angle) * acceleration * dt;

  const drag = input.brake ? SHIP_PHYSICS.brakeDrag : SHIP_PHYSICS.drag;
  const damping = Math.exp(-drag * dt);
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
