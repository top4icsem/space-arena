import { Entity } from './entity.js';
import { Vector2 } from './vector2.js';
import { createShip, integrate } from './ship.js';
import { wrapCoordinate } from './arena.js';
import { makeBullet } from './factories.js';

export class Ship extends Entity {
  #hp;

  constructor({ position = new Vector2(550, 340), team = 'player', hp = 3 } = {}) {
    super({ kind: 'ship', team, position, radius: 21 });
    this.angle = 0;
    this.thrusting = false;
    this.maxHp = hp;
    this.#hp = hp;
    this.controls = { thrust: false, brake: false, turnLeft: false, turnRight: false };
    this.fireCooldown = 0;
    this.invincibleFor = 1.5;
  }

  get hp() { return this.#hp; }

  setControls(controls) { this.controls = { ...controls }; }

  damage(amount = 1) {
    if (!this.alive || this.invincibleFor > 0) return false;
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp === 0) this.kill();
    else this.invincibleFor = 0.65;
    return true;
  }

  heal(amount = 1) {
    if (!this.alive) return 0;
    const before = this.#hp;
    this.#hp = Math.min(this.maxHp, this.#hp + amount);
    return this.#hp - before;
  }

  /** Fire originates beyond the tip of the ship (not at its center). */
  fire({ guided = false } = {}) {
    if (!this.alive || this.fireCooldown > 0) return null;
    const forward = Vector2.fromAngle(this.angle);
    const position = this.position.add(forward.scale(34));
    const velocity = this.velocity.add(forward.scale(guided ? 380 : 510));
    this.fireCooldown = guided ? 0.36 : 0.19;
    return makeBullet({ position, velocity, team: this.team, ownerId: this.id, guided });
  }

  get flightState() {
    return {
      x: this.position.x,
      y: this.position.y,
      vx: this.velocity.x,
      vy: this.velocity.y,
      angle: this.angle,
      thrusting: this.thrusting,
    };
  }

  update(dt, world) {
    this.previousPosition = this.position;
    this.invincibleFor = Math.max(0, this.invincibleFor - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    const next = integrate({
      ...createShip(this.position.x, this.position.y),
      vx: this.velocity.x,
      vy: this.velocity.y,
      angle: this.angle,
      thrusting: this.thrusting,
    }, this.controls, dt);
    this.position = new Vector2(
      wrapCoordinate(next.x, world.arena.width),
      wrapCoordinate(next.y, world.arena.height),
    );
    this.velocity = new Vector2(next.vx, next.vy);
    this.angle = next.angle;
    this.thrusting = next.thrusting;
  }
}
