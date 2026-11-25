import test from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../src/lobby/lobby.js';
import { Game } from '../src/sim/game.js';

const rooms = [{ id: 'orion', name: 'Orion', players: 1, maxPlayers: 8 }];

test('Lobby emits rooms, joins with selected room, and stops polling', async () => {
  let calls = 0;
  const lobby = new Lobby({
    intervalMs: 10000,
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ rooms }));
    },
  });
  const updates = [];
  lobby.addEventListener('rooms', (event) => updates.push(event.detail));
  let joined = null;
  lobby.addEventListener('join', (event) => {
    joined = event.detail;
  });
  lobby.start();
  await new Promise((resolve) => setTimeout(resolve, 8));
  assert.equal(calls, 1);
  assert.equal(updates.length, 1);
  lobby.join('Eagle', 'orion');
  assert.equal(joined.name, 'Eagle');
  assert.equal(joined.room.id, 'orion');
  assert.equal(lobby.visible, false);
});

test('Lobby aborts an outstanding request on leave', async () => {
  let aborted = false;
  const lobby = new Lobby({
    fetchImpl: (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  });
  lobby.start();
  lobby.stop();
  await Promise.resolve();
  assert.equal(aborted, true);
  assert.equal(lobby.rooms.length, 0);
});

test('game emits fired and keeps physics independent of audio and DOM', () => {
  const bus = new EventTarget();
  const fired = [];
  bus.addEventListener('fired', (event) => fired.push(event.detail));
  const game = new Game({ roomConfig: { asteroidCount: 3 }, eventBus: bus });
  assert.equal([...game.world.ofKind('asteroid')].length, 3);
  game.simulate(1 / 60, {}, { shooting: true });
  assert.equal(
    fired.some((event) => event.team === 'player'),
    true,
  );
});

test('collision sends both hit and exploded through EventTarget', () => {
  const bus = new EventTarget();
  const received = [];
  for (const type of ['hit', 'exploded']) bus.addEventListener(type, () => received.push(type));
  const game = new Game({ eventBus: bus });
  const asteroid = [...game.world.ofKind('asteroid')][0];
  asteroid.durability = 1;
  const bullet = game.player.fire();
  bullet.position = asteroid.position;
  bullet.previousPosition = asteroid.position;
  bullet.velocity = asteroid.velocity;
  game.world.spawn(bullet);
  game.simulate(1 / 60);
  assert.equal(received.includes('hit'), true);
  assert.equal(received.includes('exploded'), true);
});
