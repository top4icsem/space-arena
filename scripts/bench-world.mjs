/** Reproducible 30 simulation-second BEFORE/AFTER benchmark (not a browser FPS measurement). */
import { SharedWorldBaseline } from './bench-baseline-world.ts';
import { SharedWorld } from '../shared/world.ts';
import { entityId, inputSeq } from '../shared/types.ts';
import { maskToControls } from '../shared/codec.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance, PerformanceObserver } from 'node:perf_hooks';

const run = async (Class, label, seed = 45) => {
  if (global.gc) global.gc();
  const startMem = process.memoryUsage().heapUsed;
  const gc = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) gc.push(entry.duration);
  });
  observer.observe({ entryTypes: ['gc'] });
  const world = new Class({ seed, asteroidCount: 8 });
  for (let id = 1; id <= 8; id++) world.addPlayer(entityId(id));
  const frameTimes = [];
  for (let t = 1; t <= 900; t++) {
    const started = performance.now();
    for (let id = 1; id <= 8; id++) {
      const mask = 1 | (Math.floor((t + id * 9) / 11) % 2 ? 2 : 4) | (t % 9 === id % 9 ? 16 : 0);
      world.queueInput(entityId(id), { seq: inputSeq(t), mask }, maskToControls);
    }
    world.step();
    frameTimes.push(performance.now() - started);
    if (t % 60 === 0) await new Promise((resolve) => setImmediate(resolve));
  }
  observer.disconnect();
  const p = (q) => {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  };
  return {
    label,
    environment: `Node ${process.version} ${process.platform} ${process.arch}`,
    ticks: 900,
    bots: 8,
    p50Ms: p(0.5),
    p95Ms: p(0.95),
    p99Ms: p(0.99),
    gcCount: gc.length,
    maxGcPauseMs: gc.length ? Math.max(...gc) : null,
    heapDeltaMb: (process.memoryUsage().heapUsed - startMem) / 1048576,
    finalWorld: world.snapshot(),
    frameTimes,
  };
};
const baseline = await run(SharedWorldBaseline, 'before');
const optimized = await run(SharedWorld, 'after');
if (JSON.stringify(baseline.finalWorld) !== JSON.stringify(optimized.finalWorld)) {
  console.error('Deterministic parity FAILED');
  process.exitCode = 1;
}
await mkdir('bench-out', { recursive: true });
const short = (x) =>
  Object.fromEntries(Object.entries(x).filter(([k]) => !['finalWorld', 'frameTimes'].includes(k)));
await writeFile(
  'bench-out/world-30s.json',
  JSON.stringify(
    {
      baseline: short(baseline),
      optimized: short(optimized),
      parity: JSON.stringify(baseline.finalWorld) === JSON.stringify(optimized.finalWorld),
    },
    null,
    2,
  ),
);
const csv = ['version,tick,ms'];
for (const result of [baseline, optimized])
  result.frameTimes.forEach((ms, i) => csv.push(`${result.label},${i + 1},${ms}`));
await writeFile('bench-out/world-30s.csv', csv.join('\n') + '\n');
console.table([short(baseline), short(optimized)]);
console.info('Outputs: bench-out/world-30s.json, bench-out/world-30s.csv');
