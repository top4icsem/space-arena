import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector2 } from '../src/sim/vector2.js';
import { Entity } from '../src/sim/entity.js';
import { Ship } from '../src/sim/ship-class.js';
import { World } from '../src/sim/world.js';
import { makeAsteroid, makeBullet, makePickup } from '../src/sim/factories.js';
import { collectible, homing, ttl } from '../src/sim/behaviors.js';
import { circlesOverlap } from '../src/sim/collisions.js';
import { Game } from '../src/sim/game.js';

const at = (x, y) => new Vector2(x, y);

test('Vector2 arithmetic is pure and returns new frozen vectors', () => {
  const a = at(3, 4);
  const b = Object.freeze(at(2, 1));
  assert.deepEqual(a.add(b), at(5, 5));
  assert.deepEqual(a.subtract(b), at(1, 3));
  assert.deepEqual(a.scale(3), at(9, 12));
  assert.ok(Math.abs(a.normalized().x - 0.6) < 1e-12);
  assert.ok(Math.abs(a.normalized().y - 0.8) < 1e-12);
  assert.equal(a.length, 5);
  assert.equal(a.distanceTo(b), Math.sqrt(10));
  assert.deepEqual(a, at(3, 4));
  assert.notStrictEqual(a.add(b), a);
  assert.throws(() => { a.x = 40; }, TypeError);
});

test('Vector2 rotations and forward vector preserve Lab 01 up direction', () => {
  assert.deepEqual(at(0, 0).normalized(), at(0, 0));
  assert.ok(Math.abs(at(1, 0).rotated(Math.PI / 2).y - 1) < 1e-9);
  assert.deepEqual(Vector2.fromAngle(0, 5), at(0, -5));
  assert.throws(() => at(NaN, 0), RangeError);
});

test('entity ids are private, sequential and never reused after sweep', () => {
  const a = new Entity();
  const b = new Entity();
  assert.equal(b.id, a.id + 1);
  assert.equal(Object.hasOwn(a, '#id'), false);
  const world = new World();
  world.spawn(a);
  world.despawn(a.id);
  world.sweep();
  assert.equal(world.entities.has(a.id), false);
  const c = new Entity();
  assert.ok(c.id > b.id);
});

test('Ship inherits exactly one level, carries private hp with public getter', () => {
  const ship = new Ship({ position: at(80, 100) });
  assert.equal(Object.getPrototypeOf(Object.getPrototypeOf(ship)), Entity.prototype);
  assert.equal(ship.hp, 3);
  assert.equal(ship['#hp'], undefined);
  assert.throws(() => { ship.hp = 900; }, TypeError);
  ship.invincibleFor = 0;
  assert.equal(ship.damage(), true);
  assert.equal(ship.hp, 2);
  assert.equal(ship.damage(), false, 'post-hit iframes avoid instant repeated damage');
  assert.equal(ship.heal(), 1);
  assert.equal(ship.hp, 3);
});

test('Ship moves through original pure integrate() physics, controls are copied', () => {
  const world = new World();
  const ship = world.spawn(new Ship({ position: at(100, 100) }));
  const controls = { thrust: true };
  ship.setControls(controls);
  controls.thrust = false;
  world.step(1 / 60);
  assert.ok(ship.position.y < 100);
  assert.ok(ship.velocity.y < 0);
});

test('Ship.fire starts at nose, has inherited velocity, TTL and cooldown', () => {
  const ship = new Ship({ position: at(300, 300) });
  ship.angle = 0;
  ship.velocity = at(20, 30);
  const bullet = ship.fire();
  assert.equal(bullet.position.y, 266);
  assert.equal(bullet.position.x, 300);
  assert.equal(bullet.velocity.y, -480);
  assert.equal(bullet.ownerId, ship.id);
  assert.equal(bullet.kind, 'bullet');
  assert.equal(ship.fire(), null);
  const world = new World();
  world.spawn(ship);
  world.step(0.25);
  assert.ok(ship.fire());
});

test('World keeps Map, generator, iteration and marked despawns until sweep', () => {
  const world = new World();
  const a = world.spawn(makeAsteroid({ position: at(50, 50) }));
  const b = world.spawn(makeAsteroid({ position: at(250, 250) }));
  assert.ok(world.entities instanceof Map);
  assert.deepEqual([...world.ofKind('asteroid')].map((entity) => entity.id), [a.id, b.id]);
  assert.equal([...world].length, 2);
  assert.equal(world.despawn(a), true);
  assert.equal(world.entities.has(a.id), true);
  assert.deepEqual([...world.ofKind('asteroid')].map((entity) => entity.id), [b.id]);
  world.sweep();
  assert.equal(world.entities.has(a.id), false);
  assert.equal(world.entities.has(b.id), true);
});

test('World.step validates dt, applies updates, and sweeps an expired bullet', () => {
  const world = new World();
  const bullet = world.spawn(makeBullet({ position: at(70, 70), velocity: at(10, 0) }));
  assert.throws(() => world.step(-1), RangeError);
  world.step(1);
  assert.equal(bullet.alive, true);
  assert.ok(bullet.position.x > 70);
  world.step(2);
  assert.equal(bullet.alive, false);
  assert.equal(world.entities.has(bullet.id), false);
});

test('circle collisions correctly check wrap-around edges', () => {
  const a = new Entity({ position: at(5, 200), radius: 12 });
  const b = new Entity({ position: at(1095, 200), radius: 12 });
  const c = new Entity({ position: at(600, 200), radius: 12 });
  assert.equal(circlesOverlap(a, b, { width: 1100, height: 680 }), true);
  assert.equal(circlesOverlap(a, c, { width: 1100, height: 680 }), false);
});

test('player bullet destroys asteroid and both are removed at end of step', () => {
  const world = new World();
  const asteroid = world.spawn(makeAsteroid({ position: at(200, 200), velocity: at(0, 0), radius: 24 }));
  const bullet = world.spawn(makeBullet({ position: at(200, 202), velocity: at(0, 0) }));
  const events = world.step(0);
  assert.equal(world.entities.has(asteroid.id), false);
  assert.equal(world.entities.has(bullet.id), false);
  assert.ok(events.some((event) => event.type === 'destroyed' && event.target === asteroid));
});

test('bullets hit rival ships but not their own team', () => {
  const world = new World();
  const enemy = world.spawn(new Ship({ position: at(200, 200), team: 'enemy' }));
  const ally = world.spawn(new Ship({ position: at(400, 400), team: 'player' }));
  enemy.invincibleFor = 0;
  ally.invincibleFor = 0;
  world.spawn(makeBullet({ position: at(200, 200), velocity: at(0, 0), team: 'player' }));
  world.spawn(makeBullet({ position: at(400, 400), velocity: at(0, 0), team: 'player', ownerId: ally.id }));
  world.step(0);
  assert.equal(enemy.hp, 2);
  assert.equal(ally.hp, 3);
});

test('stationary pickup is composed from Entity + collectible behavior', () => {
  const world = new World();
  const ship = world.spawn(new Ship({ position: at(100, 100) }));
  ship.invincibleFor = 0;
  ship.damage(1);
  const pickup = world.spawn(makePickup(at(100, 100), { heal: 1, points: 25 }));
  assert.equal(pickup.constructor, Entity);
  assert.equal(pickup.velocity.length, 0);
  assert.ok(pickup.behaviors.some((ability) => ability.type === 'pickup'));
  const events = world.step(0);
  assert.equal(ship.hp, 3);
  assert.equal(world.entities.has(pickup.id), false);
  assert.equal(events.find((event) => event.type === 'pickup').reward.points, 25);
});

test('homing is the same composable behavior on bullet and asteroid', () => {
  const world = new World();
  const target = world.spawn(new Ship({ position: at(200, 200) }));
  const bullet = world.spawn(makeBullet({ position: at(400, 200), velocity: at(0, -380), team: 'enemy', guided: true }));
  const asteroid = world.spawn(makeAsteroid({ position: at(450, 250), velocity: at(0, -70), guided: true }));
  assert.ok(bullet.behaviors.some((ability) => ability.type === 'homing'));
  assert.ok(asteroid.behaviors.some((ability) => ability.type === 'homing'));
  // Enemy bullet deliberately targets player; guided asteroid targets same ship.
  const oldBulletX = bullet.velocity.x;
  const oldAsteroidX = asteroid.velocity.x;
  world.step(0.1);
  assert.ok(bullet.velocity.x < oldBulletX);
  assert.ok(asteroid.velocity.x < oldAsteroidX);
  assert.equal(target.hp, 3);
});

test('TTL and collectible are feature objects, not classes', () => {
  assert.equal(typeof ttl(1).update, 'function');
  const collect = collectible(() => ({ points: 10 }));
  assert.equal(collect.collect().points, 10);
  const seek = homing({ target: () => null });
  assert.equal(seek.type, 'homing');
});

test('game initializes playable entities and fixed seeded layouts', () => {
  const game = new Game();
  assert.equal(game.player.kind, 'ship');
  assert.equal(game.player.hp, 3);
  assert.equal([...game.world.ofKind('asteroid')].length, 5);
  assert.equal([...game.world.ofKind('pickup')].length, 1);
  assert.equal(game.hud.score, 0);
  const initial = [...game.world.ofKind('asteroid')].map((item) => item.position);
  game.reset();
  assert.deepEqual([...game.world.ofKind('asteroid')].map((item) => item.position), initial);
});

test('game adds score, particles and removes destroyed asteroid', () => {
  const game = new Game();
  // Move one asteroid into bullet path while keeping other entities away.
  const asteroid = [...game.world.ofKind('asteroid')][0];
  asteroid.position = at(550, 220);
  asteroid.previousPosition = asteroid.position;
  asteroid.velocity = at(0, 0);
  asteroid.durability = 1;
  game.world.spawn(makeBullet({ position: at(550, 220), velocity: at(0, 0), team: 'player', ownerId: game.player.id }));
  game.simulate(0);
  assert.equal(game.score, 50);
  assert.equal(game.destroyedAsteroids, 1);
  assert.ok([...game.world.ofKind('particle')].length > 0);
});

test('game respawns player after 2 seconds when killed', () => {
  const game = new Game();
  // Reduce the existing player to 1 HP, then collide with an asteroid.
  const dying = game.player;
  dying.invincibleFor = 0;
  dying.damage(2);
  dying.invincibleFor = 0;
  game.world.spawn(makeAsteroid({ position: at(550, 340), velocity: at(0, 0), radius: 22 }));
  game.simulate(0);
  assert.equal(game.player, null);
  assert.equal(game.respawnIn, 2);
  game.simulate(1);
  assert.equal(game.player, null);
  game.simulate(1);
  assert.ok(game.player instanceof Ship);
  assert.notEqual(game.player.id, dying.id);
  assert.equal(game.player.hp, 3);
});

