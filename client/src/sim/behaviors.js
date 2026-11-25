import { Vector2 } from './vector2.js';

/** Small, interchangeable abilities; none introduces another subclass. */
export function ttl(seconds) {
  let remaining = seconds;
  return {
    get remaining() {
      return remaining;
    },
    get fraction() {
      return Math.max(0, Math.min(1, remaining / seconds));
    },
    update(entity, dt) {
      remaining -= dt;
      if (remaining <= 0) entity.kill();
    },
  };
}

/** The game decides what can be collected; the entity only carries a capability. */
export function collectible(onCollect) {
  return { type: 'pickup', collect: onCollect, update() {} };
}

/** Steering works for bullets AND asteroids via the same behavior object/factory. */
export function homing({ target, turnRate = 2.7, speed = 140 }) {
  return {
    type: 'homing',
    update(entity, dt, world) {
      const destination = target(entity, world);
      if (!destination?.alive) return;
      const width = world.arena.width;
      const height = world.arena.height;
      let dx = destination.position.x - entity.position.x;
      let dy = destination.position.y - entity.position.y;
      if (dx > width / 2) dx -= width;
      if (dx < -width / 2) dx += width;
      if (dy > height / 2) dy -= height;
      if (dy < -height / 2) dy += height;
      const desired = new Vector2(dx, dy);
      if (desired.length < 1e-9) return;
      const current =
        entity.velocity.length > 1e-9 ? entity.velocity.normalized() : desired.normalized();
      const aim = desired.normalized();
      const cross = current.x * aim.y - current.y * aim.x;
      const dot = current.x * aim.x + current.y * aim.y;
      const angle = Math.atan2(cross, dot);
      const correction = Math.max(-turnRate * dt, Math.min(turnRate * dt, angle));
      entity.velocity = current.rotated(correction).scale(speed);
    },
  };
}

export function nearestOfKind(entity, world, kind, predicate = () => true) {
  let nearest = null;
  let best = Infinity;
  for (const candidate of world.ofKind(kind)) {
    if (candidate.id === entity.id || !candidate.alive || !predicate(candidate)) continue;
    let dx = Math.abs(candidate.position.x - entity.position.x);
    let dy = Math.abs(candidate.position.y - entity.position.y);
    dx = Math.min(dx, world.arena.width - dx);
    dy = Math.min(dy, world.arena.height - dy);
    const squared = dx * dx + dy * dy;
    if (squared < best) {
      best = squared;
      nearest = candidate;
    }
  }
  return nearest;
}
