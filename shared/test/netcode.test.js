import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkGame } from '../../client/src/network/netcode.ts';
import { SharedWorld } from '../world.ts';
import { maskToControls } from '../codec.ts';

test('Prediction replays only unacknowledged inputs and matches authority with no loss', () => {
  const connection = { status: 'connected', sendInput: () => 7, send: () => true };
  const net = new NetworkGame(connection);
  net.joined({ netId: 1 });
  const world = new SharedWorld({ seed: 12, asteroidCount: 0 });
  world.addPlayer(1);
  net.applySnapshot(world.snapshot(0));
  // Client predicts three steps while packets are in flight.
  const control = { thrust: true, turnLeft: false, turnRight: false, brake: false };
  for (let i = 0; i < 3; i++) net.simulate(1 / 30, control);
  assert.equal(net.pending.length, 3);
  world.queueInput(1, { seq: 1, mask: 1 }, maskToControls);
  world.step();
  net.applySnapshot(world.snapshot(1));
  assert.deepEqual(
    net.pending.map((x) => x.seq),
    [2, 3],
  );
  const server = new SharedWorld({ seed: 12, asteroidCount: 0 });
  server.addPlayer(1);
  for (let i = 0; i < 3; i++) {
    server.queueInput(1, { seq: i + 1, mask: 1 }, maskToControls);
    server.step();
  }
  assert.ok(Math.abs(net.predicted.y - server.players.get(1).y) < 0.0001);
  net.reset();
});
test('Remote interpolation uses two authoritative snapshots (never remote raw input)', () => {
  const net = new NetworkGame({ status: 'connected' });
  net.joined({ netId: 1 });
  const a = {
    tick: 2,
    ack: 0,
    players: [
      { id: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0, hp: 3, alive: true },
      { id: 2, x: 100, y: 100, vx: 0, vy: 0, angle: 0, hp: 3, alive: true },
    ],
    bullets: [],
    asteroids: [],
    pickups: [],
  };
  const b = { ...a, tick: 4, players: [{ ...a.players[0] }, { ...a.players[1], x: 200 }] };
  net.applySnapshot(a);
  net.applySnapshot(b);
  const remote = net.interpolate(a, b, 0.5).find((p) => p.kind === 'ship');
  assert.equal(remote.position.x, 150);
  net.reset();
});
