import { ARENA, wrapCoordinate } from '../sim/arena.js';

export function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}

export function lerpAngle(a, b, alpha) {
  const shortestTurn = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + shortestTurn * alpha;
}

export function lerpWrapped(a, b, alpha, span) {
  let displacement = b - a;
  if (displacement > span / 2) displacement -= span;
  if (displacement < -span / 2) displacement += span;
  return wrapCoordinate(a + displacement * alpha, span);
}

export function interpolateShip(previous, current, alpha, arena = ARENA) {
  return {
    x: lerpWrapped(previous.x, current.x, alpha, arena.width),
    y: lerpWrapped(previous.y, current.y, alpha, arena.height),
    vx: lerp(previous.vx, current.vx, alpha),
    vy: lerp(previous.vy, current.vy, alpha),
    angle: lerpAngle(previous.angle, current.angle, alpha),
    thrusting: current.thrusting,
  };
}
