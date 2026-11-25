import { ARENA, wrapCoordinate } from './arena.js';
import { Vector2 } from './vector2.js';

/** Only Ship inherits from Entity. All optional abilities are composed behaviors. */
export class Entity {
  static #id = 0;

  constructor({
    position = new Vector2(),
    velocity = new Vector2(),
    radius = 10,
    kind = 'entity',
    behaviors = [],
    team = 'neutral',
  } = {}) {
    if (!(position instanceof Vector2) || !(velocity instanceof Vector2)) {
      throw new TypeError('Entity position and velocity must be Vector2 values');
    }
    if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Invalid entity radius');
    this.id = ++Entity.#id;
    this.position = position;
    this.previousPosition = position;
    this.velocity = velocity;
    this.radius = radius;
    this.kind = kind;
    this.team = team;
    this.behaviors = [...behaviors];
    this.alive = true;
  }

  kill() {
    this.alive = false;
  }

  update(dt, world) {
    this.previousPosition = this.position;
    for (const behavior of this.behaviors) {
      if (!this.alive) break;
      behavior.update(this, dt, world);
    }
    if (this.alive) {
      this.position = this.position.add(this.velocity.scale(dt));
      this.position = new Vector2(
        wrapCoordinate(this.position.x, world?.arena.width ?? ARENA.width),
        wrapCoordinate(this.position.y, world?.arena.height ?? ARENA.height),
      );
    }
  }
}
