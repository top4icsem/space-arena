// Requires running Vite and browser installed. Compare main-thread vs Web Worker starfield startup.
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const useWorker of [false, true]) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:5173/?worker=${useWorker ? 1 : 0}`);
    let time = null;
    if (useWorker) {
      await page.waitForFunction(() => Boolean(window.__lab07Starfield));
      time = await page.evaluate(() => window.__lab07Starfield.totalMs);
    } else {
      time = await page.evaluate(() => {
        const start = performance.now();
        // Main-thread controls: compute exactly 164 deterministic stars, no Worker startup.
        let state = 103053;
        const rnd = () => {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          return state / 4294967296;
        };
        for (let i = 0; i < 164; i++) {
          rnd();
          rnd();
          rnd();
          rnd();
        }
        return performance.now() - start;
      });
    }
    results.push({ worker: useWorker, elapsedMs: time });
    await page.close();
  }
} finally {
  await browser.close();
}
await mkdir('bench-out', { recursive: true });
await writeFile('bench-out/worker.json', JSON.stringify(results, null, 2));
console.table(results);
