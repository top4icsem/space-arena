import { Entity } from './entity.js';
import { Vector2 } from './vector2.js';
import { collectible, homing, nearestOfKind, ttl } from './behaviors.js';

export function makeBullet({ position, velocity, team = 'player', ownerId = null, guided = false }) {
  const behaviors = [ttl(guided ? 3.4 : 2.1)];
  if (guided) {
    behaviors.push(homing({
      speed: 380,
      turnRate: 3.6,
      target: (self, world) => {
        const enemy = nearestOfKind(self, world, 'ship', (ship) => ship.team !== team && ship.id !== ownerId);
        return enemy ?? nearestOfKind(self, world, 'asteroid');
      },
    }));
  }
  const bullet = new Entity({ kind: 'bullet', team, radius: guided ? 6 : 4, position, velocity, behaviors });
  bullet.ownerId = ownerId;
  bullet.guided = guided;
  bullet.ttl = behaviors[0];
  return bullet;
}

export function makeAsteroid({ position, velocity = new Vector2(20, 12), radius = 27, guided = false }) {
  const behaviors = guided ? [homing({
    speed: 64,
    turnRate: 0.9,
    target: (self, world) => nearestOfKind(self, world, 'ship', (ship) => ship.team === 'player'),
  })] : [];
  const asteroid = new Entity({ kind: 'asteroid', position, velocity, radius, behaviors });
  asteroid.guided = guided;
  asteroid.durability = radius > 31 ? 2 : 1;
  asteroid.rotation = (position.x * 0.013 + position.y * 0.004) % (Math.PI * 2);
  return asteroid;
}

export function makePickup(position, { heal = 1, points = 25 } = {}) {
  const pickup = new Entity({
    kind: 'pickup',
    radius: 16,
    position,
    velocity: new Vector2(),
    behaviors: [collectible((ship) => ({ healed: ship.heal(heal), points }))],
  });
  return pickup;
}

export function makeParticle({ position, velocity, color = '#7ae6ff', lifetime = 0.5, radius = 2 }) {
  const timer = ttl(lifetime);
  const particle = new Entity({ kind: 'particle', radius, position, velocity, behaviors: [timer] });
  particle.color = color;
  particle.ttl = timer;
  return particle;
}
