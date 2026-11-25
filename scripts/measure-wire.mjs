import { SharedWorld } from '../shared/world.ts';
import { encodeSnapshot, encodeInput, controlsToMask } from '../shared/codec.ts';
const world = new SharedWorld({ seed: 4267, asteroidCount: 5 });
world.addPlayer(1);
world.addPlayer(2);
const rows = [];
for (let i = 1; i <= 150; i++) {
  world.queueInput(1, { seq: i, mask: controlsToMask({ thrust: true, fire: true }) }, (mask) => ({
    thrust: Boolean(mask & 1),
    fire: Boolean(mask & 16),
    guided: Boolean(mask & 32),
  }));
  world.step();
  if (i % 2) continue;
  const state = world.snapshot(world.players.get(1)?.ack ?? 0);
  const binary = encodeSnapshot(state).byteLength;
  const json = Buffer.byteLength(JSON.stringify({ v: 0, type: 'snapshot', ...state }));
  rows.push({ json, binary });
}
function avg(key) {
  return Math.round(rows.reduce((sum, r) => sum + r[key], 0) / rows.length);
}
const input = { v: 0, type: 'input', seq: 123456, mask: 17 };
console.log(
  JSON.stringify(
    {
      samples: rows.length,
      players: 2,
      asteroids: 5,
      inputJSON: Buffer.byteLength(JSON.stringify(input)),
      inputBinary: encodeInput(input).byteLength,
      averageSnapshotJSON: avg('json'),
      averageSnapshotBinary: avg('binary'),
      reductionPct: Math.round(100 * (1 - avg('binary') / avg('json'))),
    },
    null,
    2,
  ),
);
