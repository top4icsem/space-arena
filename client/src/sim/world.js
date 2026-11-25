import { ARENA } from './arena.js';
import { Entity } from './entity.js';
import { resolveCollisions } from './collisions.js';

export class World {
  constructor({ arena = ARENA, onSwept = null } = {}) {
    this.arena = arena;
    this.onSwept = onSwept;
    this.entities = new Map();
    this.time = 0;
    this.events = [];
  }

  spawn(entity) {
    if (!(entity instanceof Entity)) throw new TypeError('World.spawn expects an Entity');
    if (!entity.alive) throw new Error('Cannot spawn a dead entity');
    if (this.entities.has(entity.id)) throw new Error(`Entity ${entity.id} already spawned`);
    this.entities.set(entity.id, entity);
    return entity;
  }

  /** Mark first, remove in sweep AFTER all updates/collision checks. */
  despawn(entityOrId) {
    const id = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
    const entity = this.entities.get(id);
    if (entity) entity.kill();
    return Boolean(entity);
  }

  sweep() {
    for (const [id, entity] of this.entities) {
      if (!entity.alive) {
        this.entities.delete(id);
        this.onSwept?.(entity);
      }
    }
  }

  *ofKind(kind) {
    for (const entity of this.entities.values()) {
      if (entity.alive && entity.kind === kind) yield entity;
    }
  }

  [Symbol.iterator]() {
    return this.entities.values();
  }
  emit(event) {
    this.events.push(event);
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid world timestep');
    this.events = [];
    // A snapshot prevents entities spawned mid-update from updating twice.
    for (const entity of [...this.entities.values()]) {
      if (entity.alive) entity.update(dt, this);
    }
    resolveCollisions(this);
    this.sweep();
    this.time += dt;
    return this.events;
  }
}
