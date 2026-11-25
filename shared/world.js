import { ARENA, STEP, createShip, advance, wrapCoordinate } from './flight.js';
import { createRandom } from './prng.js';
const distance2 = (a, b) => {
  const dx = Math.abs(a.x - b.x),
    dy = Math.abs(a.y - b.y);
  return Math.min(dx, ARENA.width - dx) ** 2 + Math.min(dy, ARENA.height - dy) ** 2;
};
export const emptyControls = Object.freeze({
  thrust: false,
  turnLeft: false,
  turnRight: false,
  brake: false,
  fire: false,
  guided: false,
});
/** The authoritative world has deterministic state transitions. No timers, DOM or Node imports. */
export class SharedWorld {
  constructor({ seed = 12345, asteroidCount = 5 } = {}) {
    this.seed = seed >>> 0;
    this.random = createRandom(this.seed);
    this.tick = 0;
    this.nextEntity = 1;
    this.players = new Map();
    this.bullets = [];
    this.asteroids = [];
    this.pickups = [];
    this.pickupCooldown = 8;
    for (let i = 0; i < asteroidCount; i++) this.spawnAsteroid();
    this.spawnPickup();
  }
  spawnAsteroid() {
    const id = this.nextEntity++;
    const x = 60 + this.random() * (ARENA.width - 120),
      y = 60 + this.random() * (ARENA.height - 120);
    const theta = this.random() * Math.PI * 2,
      speed = 9 + this.random() * 18;
    this.asteroids.push({
      id,
      x,
      y,
      vx: Math.cos(theta) * speed,
      vy: Math.sin(theta) * speed,
      radius: 19 + Math.floor(this.random() * 19),
      hp: 2,
      guided: this.random() < 0.22,
    });
  }
  spawnPickup() {
    this.pickups.push({
      id: this.nextEntity++,
      x: 70 + this.random() * 960,
      y: 70 + this.random() * 540,
    });
  }
  addPlayer(id) {
    if (this.players.has(id)) throw new Error('Already in world');
    const slot = this.players.size;
    const state = createShip((170 + slot * 310) % ARENA.width, (170 + slot * 195) % ARENA.height);
    state.angle = (slot % 2) * Math.PI;
    const player = {
      id,
      ...state,
      hp: 3,
      score: 0,
      alive: true,
      respawn: 0,
      cooldown: 0,
      input: emptyControls,
      pending: [],
      ack: 0,
      invincible: 1.2,
    };
    this.players.set(id, player);
    return player;
  }
  removePlayer(id) {
    this.players.delete(id);
  }
  queueInput(id, { seq, mask }, maskToControls) {
    const p = this.players.get(id);
    if (!p || seq <= p.ack || !Number.isSafeInteger(seq) || seq > 0xffffffff) return false;
    if (p.pending.length >= 90) {
      p.pending.shift();
    } // cap memory on fast/abusive clients
    if (p.pending.some((entry) => entry.seq === seq)) return false;
    p.pending.push({ seq, input: maskToControls(mask) });
    return true;
  }
  shoot(p) {
    if (p.cooldown > 0 || !p.alive) return null;
    const forwardX = Math.sin(p.angle),
      forwardY = -Math.cos(p.angle);
    const velocity = p.input.guided ? 390 : 525;
    const bullet = {
      id: this.nextEntity++,
      ownerId: p.id,
      x: wrapCoordinate(p.x + 30 * forwardX, ARENA.width),
      y: wrapCoordinate(p.y + 30 * forwardY, ARENA.height),
      vx: p.vx + forwardX * velocity,
      vy: p.vy + forwardY * velocity,
      ttl: 1.3,
      guided: Boolean(p.input.guided),
    };
    this.bullets.push(bullet);
    p.cooldown = p.input.guided ? 0.36 : 0.19;
    return bullet;
  }
  step() {
    this.tick++;
    const events = [];
    for (const p of this.players.values()) {
      while (p.pending.length && p.pending[0].seq <= p.ack) p.pending.shift();
      if (p.pending.length) {
        const next = p.pending.shift();
        p.ack = next.seq;
        p.input = next.input;
      }
      p.cooldown = Math.max(0, p.cooldown - STEP);
      p.invincible = Math.max(0, p.invincible - STEP);
      if (!p.alive) {
        p.respawn -= STEP;
        if (p.respawn <= 0) {
          Object.assign(
            p,
            createShip((170 + p.id * 97) % ARENA.width, (170 + p.id * 51) % ARENA.height),
          );
          p.hp = 3;
          p.alive = true;
          p.respawn = 0;
          p.invincible = 1.2;
          events.push({ type: 'respawn', player: p.id });
        }
        continue;
      }
      Object.assign(p, advance(p, p.input, STEP));
      if (p.input.fire) {
        const bullet = this.shoot(p);
        if (bullet) events.push({ type: 'fired', player: p.id });
      }
    }
    for (const rock of this.asteroids) {
      if (rock.guided && this.players.size) {
        const victim = [...this.players.values()].find((p) => p.alive);
        if (victim) {
          const dx = victim.x - rock.x,
            dy = victim.y - rock.y;
          const d = Math.hypot(dx, dy) || 1;
          rock.vx += (dx / d) * 20 * STEP;
          rock.vy += (dy / d) * 20 * STEP;
          const speed = Math.hypot(rock.vx, rock.vy) || 1;
          if (speed > 36) {
            rock.vx *= 36 / speed;
            rock.vy *= 36 / speed;
          }
        }
      }
      rock.x = wrapCoordinate(rock.x + rock.vx * STEP, ARENA.width);
      rock.y = wrapCoordinate(rock.y + rock.vy * STEP, ARENA.height);
    }
    for (const bullet of this.bullets) {
      if (bullet.guided) {
        const target =
          [...this.players.values()].find((p) => p.alive && p.id !== bullet.ownerId) ||
          this.asteroids[0];
        if (target) {
          const dx = target.x - bullet.x,
            dy = target.y - bullet.y;
          const d = Math.hypot(dx, dy) || 1;
          const velocity = Math.hypot(bullet.vx, bullet.vy) || 390;
          bullet.vx = bullet.vx * 0.93 + (dx / d) * velocity * 0.07;
          bullet.vy = bullet.vy * 0.93 + (dy / d) * velocity * 0.07;
        }
      }
      bullet.x = wrapCoordinate(bullet.x + bullet.vx * STEP, ARENA.width);
      bullet.y = wrapCoordinate(bullet.y + bullet.vy * STEP, ARENA.height);
      bullet.ttl -= STEP;
      if (bullet.ttl <= 0) continue;
      for (const p of this.players.values()) {
        if (!p.alive || p.id === bullet.ownerId || p.invincible > 0) continue;
        if (distance2(bullet, p) < 25 ** 2) {
          bullet.ttl = 0;
          p.hp--;
          p.invincible = 0.75;
          events.push({ type: 'hit', player: p.id, by: bullet.ownerId });
          if (p.hp === 0) {
            p.alive = false;
            p.respawn = 2;
            const owner = this.players.get(bullet.ownerId);
            if (owner) owner.score += 200;
            events.push({ type: 'exploded', player: p.id, by: bullet.ownerId });
          }
          break;
        }
      }
      if (bullet.ttl <= 0) continue;
      for (const rock of this.asteroids) {
        if (distance2(bullet, rock) < (rock.radius + 4) ** 2) {
          bullet.ttl = 0;
          rock.hp--;
          events.push({ type: 'hit', asteroid: rock.id, by: bullet.ownerId });
          if (rock.hp === 0) {
            const owner = this.players.get(bullet.ownerId);
            if (owner) owner.score += 50;
            events.push({ type: 'exploded', asteroid: rock.id, by: bullet.ownerId });
          }
          break;
        }
      }
    }
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const pickup of this.pickups) {
        if (distance2(p, pickup) < 32 ** 2) {
          p.hp = Math.min(3, p.hp + 1);
          p.score += 100;
          pickup.taken = true;
          events.push({ type: 'collected', player: p.id });
        }
      }
      for (const rock of this.asteroids) {
        if (p.invincible <= 0 && distance2(p, rock) < (rock.radius + 19) ** 2) {
          p.hp--;
          p.invincible = 1;
          events.push({ type: 'hit', player: p.id, asteroid: rock.id });
          if (p.hp <= 0) {
            p.hp = 0;
            p.alive = false;
            p.respawn = 2;
            events.push({ type: 'exploded', player: p.id, asteroid: rock.id });
          }
        }
      }
    }
    this.pickups = this.pickups.filter((p) => !p.taken);
    this.pickupCooldown -= STEP;
    if (this.pickupCooldown <= 0) {
      this.pickupCooldown = 8;
      if (this.pickups.length < 2) this.spawnPickup();
    }
    this.bullets = this.bullets.filter((b) => b.ttl > 0);
    const destroyed = this.asteroids.length - this.asteroids.filter((a) => a.hp > 0).length;
    this.asteroids = this.asteroids.filter((a) => a.hp > 0);
    for (let i = 0; i < destroyed; i++) this.spawnAsteroid();
    return events;
  }
  snapshot(ack = 0) {
    return {
      tick: this.tick,
      ack,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        angle: p.angle,
        thrusting: p.thrusting,
        alive: p.alive,
        hp: p.hp,
        score: p.score,
        respawn: p.respawn,
      })),
      bullets: this.bullets.map(({ id, ownerId, x, y, vx, vy, guided }) => ({
        id,
        ownerId,
        x,
        y,
        vx,
        vy,
        guided,
      })),
      asteroids: this.asteroids.map(({ id, x, y, radius, hp, guided }) => ({
        id,
        x,
        y,
        radius,
        hp,
        guided,
      })),
      pickups: this.pickups.map(({ id, x, y }) => ({ id, x, y })),
    };
  }
}
