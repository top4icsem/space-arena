/** Circle intersections use toroidal (wrap-around) arena distances. */
export function circlesOverlap(a, b, arena) {
  let dx = Math.abs(a.position.x - b.position.x);
  let dy = Math.abs(a.position.y - b.position.y);
  dx = Math.min(dx, arena.width - dx);
  dy = Math.min(dy, arena.height - dy);
  return dx * dx + dy * dy <= (a.radius + b.radius) ** 2;
}

function damageTarget(world, target, source, amount = 1) {
  if (target.kind === 'ship') {
    const hit = target.damage(amount);
    if (hit) world.emit({ type: 'ship-hit', target, source });
    if (hit && !target.alive) world.emit({ type: 'destroyed', target, source });
    return hit;
  }
  if (target.kind === 'asteroid') {
    target.durability -= amount;
    world.emit({ type: 'asteroid-hit', target, source });
    if (target.durability <= 0) {
      target.kill();
      world.emit({ type: 'destroyed', target, source });
    }
    return true;
  }
  return false;
}

function resolvePair(world, a, b) {
  if (!a.alive || !b.alive) return;
  let bullet = a.kind === 'bullet' ? a : b.kind === 'bullet' ? b : null;
  if (bullet) {
    const target = bullet === a ? b : a;
    if (target.kind !== 'ship' && target.kind !== 'asteroid') return;
    if (target.kind === 'ship' && (target.team === bullet.team || target.id === bullet.ownerId)) return;
    if (damageTarget(world, target, bullet)) bullet.kill();
    return;
  }

  const ship = a.kind === 'ship' ? a : b.kind === 'ship' ? b : null;
  if (!ship) return;
  const other = ship === a ? b : a;
  if (other.kind === 'pickup' && ship.team === 'player') {
    const ability = other.behaviors.find((behavior) => behavior.type === 'pickup');
    if (ability) {
      world.emit({ type: 'pickup', target: ship, source: other, reward: ability.collect(ship) });
      other.kill();
    }
  } else if (other.kind === 'asteroid') {
    if (damageTarget(world, ship, other)) {
      other.kill();
      world.emit({ type: 'destroyed', target: other, source: ship });
    }
  }
}

/** Deliberately O(n²): readable for the small fixed-size teaching arena. */
export function resolveCollisions(world) {
  const collidable = [...world].filter((entity) => entity.alive && entity.kind !== 'particle');
  for (let i = 0; i < collidable.length; i++) {
    for (let j = i + 1; j < collidable.length; j++) {
      const a = collidable[i];
      const b = collidable[j];
      if (a.alive && b.alive && circlesOverlap(a, b, world.arena)) resolvePair(world, a, b);
    }
  }
}
