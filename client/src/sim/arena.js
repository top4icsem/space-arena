export const ARENA = Object.freeze({ width: 1100, height: 680 });

/** Wraps a coordinate into the half-open interval [0, size). */
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
