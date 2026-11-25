import { ARENA } from './arena.js';
import { Vector2 } from './vector2.js';
import { Ship } from './ship-class.js';
import { World } from './world.js';
import { makeAsteroid, makeParticle, makePickup } from './factories.js';

function seededRandomGame(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Enemy is another Ship, not an EnemyShip extends Ship: one inheritance level. */
export class Game {
  constructor({ roomConfig = {}, eventBus = null } = {}) {
    this.roomConfig = roomConfig;
    this.eventBus = eventBus;
    this.reset();
  }

  notify(type, detail) {
    this.eventBus?.dispatchEvent(new CustomEvent(type, { detail }));
  }

  reset() {
    this.world = new World();
    this.random = seededRandomGame(4267);
    this.score = 0;
    this.destroyedAsteroids = 0;
    this.respawnIn = 0;
    this.enemyRespawnIn = 0;
    this.asteroidTimer = 0;
    this.pickupTimer = 0;
    this.player = this.world.spawn(new Ship({ position: new Vector2(550, 340) }));
    this.enemy = this.world.spawn(
      new Ship({ position: new Vector2(920, 120), team: 'enemy', hp: 2 }),
    );
    this.enemy.angle = Math.PI;
    const starters = [
      [155, 130, 29, 28, 9, false],
      [325, 510, 37, -15, 18, false],
      [780, 500, 24, -17, -28, false],
      [1030, 380, 29, 24, -13, false],
      [175, 590, 22, 42, -8, true],
    ];
    const startCount = Math.max(1, Math.min(10, this.roomConfig.asteroidCount ?? 5));
    for (const [x, y, radius, vx, vy, guided] of starters.slice(0, startCount)) {
      this.world.spawn(
        makeAsteroid({
          position: new Vector2(x, y),
          velocity: new Vector2(vx, vy),
          radius,
          guided,
        }),
      );
    }
    for (let i = starters.length; i < startCount; i++) this.spawnAsteroid();
    this.world.spawn(makePickup(new Vector2(630, 290)));
  }

  get playerState() {
    return this.player?.alive
      ? this.player.flightState
      : {
          x: ARENA.width / 2,
          y: ARENA.height / 2,
          vx: 0,
          vy: 0,
          angle: 0,
          thrusting: false,
        };
  }

  spawnAsteroid() {
    const side = Math.floor(this.random() * 4);
    const x = side === 0 ? 20 : side === 1 ? ARENA.width - 20 : this.random() * ARENA.width;
    const y = side === 2 ? 20 : side === 3 ? ARENA.height - 20 : this.random() * ARENA.height;
    const radius = 21 + this.random() * 18;
    const angle = this.random() * Math.PI * 2;
    const guided = this.random() < 0.25;
    this.world.spawn(
      makeAsteroid({
        position: new Vector2(x, y),
        velocity: Vector2.fromAngle(angle, 28 + this.random() * 23),
        radius,
        guided,
      }),
    );
  }

  addExplosion(position, kind) {
    const color = kind === 'ship' ? '#f28f7e' : kind === 'pickup' ? '#81f5b7' : '#fecb8d';
    for (let i = 0; i < 17; i++) {
      const angle = (i / 17) * Math.PI * 2 + this.random() * 0.32;
      const speed = 42 + this.random() * 185;
      this.world.spawn(
        makeParticle({
          position,
          velocity: new Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed),
          color,
          lifetime: 0.25 + this.random() * 0.55,
          radius: 1 + this.random() * 2.7,
        }),
      );
    }
  }

  driveEnemy(dt) {
    if (!this.enemy?.alive) return;
    if (!this.player?.alive) {
      this.enemy.setControls({ thrust: false, turnLeft: false, turnRight: false });
      return;
    }
    let dx = this.player.position.x - this.enemy.position.x;
    let dy = this.player.position.y - this.enemy.position.y;
    if (dx > ARENA.width / 2) dx -= ARENA.width;
    if (dx < -ARENA.width / 2) dx += ARENA.width;
    if (dy > ARENA.height / 2) dy -= ARENA.height;
    if (dy < -ARENA.height / 2) dy += ARENA.height;
    const desiredAngle = Math.atan2(dx, -dy);
    const difference = Math.atan2(
      Math.sin(desiredAngle - this.enemy.angle),
      Math.cos(desiredAngle - this.enemy.angle),
    );
    this.enemy.setControls({
      thrust: Math.hypot(dx, dy) > 135,
      turnLeft: difference < -0.09,
      turnRight: difference > 0.09,
      brake: Math.hypot(dx, dy) < 115,
    });
    if (Math.abs(difference) < 0.35 && Math.hypot(dx, dy) < 540) {
      const bullet = this.enemy.fire();
      if (bullet) {
        this.world.spawn(bullet);
        this.notify('fired', {
          team: 'enemy',
          guided: false,
          x: bullet.position.x,
          y: bullet.position.y,
        });
      }
    }
    void dt;
  }

  simulate(dt, controls = {}, { shooting = false, guided = false } = {}) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid game timestep');
    // Count down BEFORE collision events: death starts a full 2-second timer.
    if (this.player === null) {
      this.respawnIn = Math.max(0, this.respawnIn - dt);
      if (this.respawnIn === 0) {
        this.player = this.world.spawn(new Ship({ position: new Vector2(550, 340) }));
      }
    }
    if (this.enemy === null) {
      this.enemyRespawnIn = Math.max(0, this.enemyRespawnIn - dt);
      if (this.enemyRespawnIn === 0) {
        this.enemy = this.world.spawn(
          new Ship({ position: new Vector2(940, 130), team: 'enemy', hp: 2 }),
        );
        this.enemy.angle = Math.PI;
      }
    }
    this.player?.setControls(controls);
    this.driveEnemy(dt);

    // Fire is a method call ON the instance: `player.fire()`, never a bare callback.
    if (shooting && this.player?.alive) {
      const bullet = this.player.fire({ guided });
      if (bullet) {
        this.world.spawn(bullet);
        this.notify('fired', {
          team: 'player',
          guided,
          x: bullet.position.x,
          y: bullet.position.y,
        });
      }
    }

    const events = this.world.step(dt);
    for (const event of events) {
      if (event.type === 'ship-hit' || event.type === 'asteroid-hit') {
        this.notify('hit', { kind: event.target.kind, team: event.target.team ?? null });
      }
      if (event.type === 'destroyed') {
        this.notify('exploded', { kind: event.target.kind, team: event.target.team ?? null });
        this.addExplosion(event.target.position, event.target.kind);
        if (event.target.kind === 'asteroid') {
          this.destroyedAsteroids++;
          if (event.source?.kind === 'bullet' && event.source.team === 'player') this.score += 50;
        } else if (event.target.kind === 'ship' && event.target.team === 'enemy') {
          this.score += 200;
        }
        if (event.target === this.player) {
          this.respawnIn = 2;
          this.player = null;
        }
        if (event.target === this.enemy) {
          this.enemyRespawnIn = 4;
          this.enemy = null;
        }
      } else if (event.type === 'pickup') {
        this.addExplosion(event.source.position, 'pickup');
        this.notify('collected', { points: event.reward.points });
        if (event.target.team === 'player') this.score += event.reward.points;
      }
    }

    this.asteroidTimer += dt;
    const asteroidInterval = Math.max(1, this.roomConfig.asteroidRespawnSeconds ?? 3.4);
    if (this.asteroidTimer >= asteroidInterval) {
      this.asteroidTimer -= asteroidInterval;
      if ([...this.world.ofKind('asteroid')].length < 8) this.spawnAsteroid();
    }
    this.pickupTimer += dt;
    if (this.pickupTimer >= 8) {
      this.pickupTimer -= 8;
      if ([...this.world.ofKind('pickup')].length === 0) {
        this.world.spawn(
          makePickup(new Vector2(180 + this.random() * 740, 100 + this.random() * 470)),
        );
      }
    }
    return events;
  }

  get hud() {
    const counts = { bullets: 0, asteroids: 0, pickups: 0, particles: 0 };
    for (const entity of this.world) {
      const key = `${entity.kind}s`;
      if (key in counts) counts[key]++;
    }
    return {
      score: this.score,
      hp: this.player?.hp ?? 0,
      maxHp: 3,
      respawnIn: this.respawnIn,
      destroyedAsteroids: this.destroyedAsteroids,
      ...counts,
    };
  }
}
