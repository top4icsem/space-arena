import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms.js';
import { TickScheduler, TICK_MS } from '../src/network/ticker.js';

test('Lab 05: three seeded lobbies remain after last player leaves; custom rooms disappear', () => {
  const manager = new RoomManager();
  assert.deepEqual(
    manager
      .list()
      .map((x) => x.id)
      .sort(),
    ['nebula', 'orion', 'zenith'],
  );
  for (const id of ['orion', 'nebula', 'zenith']) {
    const room = manager.get(id);
    room.join({ id: `${id}-player`, name: 'Pilot' });
    room.leave(`${id}-player`);
  }
  assert.equal(manager.list().length, 3);
  const extra = manager.create({ id: 'temporary', name: 'Temporary' });
  extra.join({ id: 'guest', name: 'Guest' });
  extra.leave('guest');
  assert.equal(manager.get('temporary'), undefined);
  assert.equal(manager.list().length, 3);
});
test('Scheduler catches up to a target clock without setInterval and stops cleanly', () => {
  let now = 0,
    callback = null,
    count = 0;
  const scheduler = new TickScheduler(
    () => {
      count++;
    },
    {
      now: () => now,
      schedule: (fn) => {
        callback = fn;
        return 1;
      },
      cancel: () => {
        callback = null;
      },
    },
  );
  scheduler.start();
  now = TICK_MS + 0.01;
  callback();
  assert.equal(count, 1);
  now += 2 * TICK_MS;
  callback();
  assert.equal(count, 3);
  scheduler.stop();
  assert.equal(callback, null);
});
