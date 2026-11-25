/** Usage: with npm run dev running: node scripts/profile-browser.mjs after (30s).
    Captures measured browser rAF p50/p95/p99, long tasks, CPU profile, screenshot.
    Run in clean lab-06 worktree for the BEFORE baseline; never invent a baseline. */
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const tag = process.argv[2] || 'after';
if (!/^(before|after)$/.test(tag)) throw new Error('Expected before or after label');
const url = process.env.PROFILE_URL || 'http://127.0.0.1:5173/?bots=8';
await mkdir('bench-out', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-background-timer-throttling'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await page.addInitScript(() => {
  window.__lab07Frames = [];
  window.__lab07LongTasks = [];
  let last = 0;
  const sample = (t) => {
    if (last) window.__lab07Frames.push(t - last);
    last = t;
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__lab07LongTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ entryTypes: ['longtask'] });
  }
});
try {
  await page.goto(url);
  await page.locator('#pilot-name').fill(`Profile${tag}`);
  await page.locator('#join-game').waitFor({ state: 'visible' });
  await page.locator('#join-game').click();
  await page.waitForFunction(() => window.__spaceArenaDebug.getNetwork().status === 'connected');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  await cdp.send('Performance.enable');
  await page.locator('#arena').focus();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(30000);
  await page.keyboard.up('KeyW');
  const cpu = await cdp.send('Profiler.stop');
  const metrics = await cdp.send('Performance.getMetrics');
  const measured = await page.evaluate(() => ({
    frames: window.__lab07Frames,
    longTasks: window.__lab07LongTasks,
    game: window.__spaceArenaDebug.getNetwork(),
  }));
  await page.screenshot({ path: `bench-out/browser-${tag}.png`, fullPage: true });
  const sorted = measured.frames.filter((x) => x > 0 && x < 1000).sort((a, b) => a - b);
  const pct = (q) => sorted[Math.floor(q * (sorted.length - 1))] ?? null;
  const summary = {
    tag,
    url,
    samples: sorted.length,
    p50Ms: pct(0.5),
    p95Ms: pct(0.95),
    p99Ms: pct(0.99),
    longTasks: measured.longTasks.length,
    largestLongTaskMs: Math.max(0, ...measured.longTasks.map((x) => x.duration)),
    jsHeapUsedBytes: metrics.metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? null,
    note: '30 seconds in a foreground, headless Chromium process; GC detail requires Chrome DevTools trace',
  };
  await writeFile(`bench-out/browser-${tag}.json`, JSON.stringify(summary, null, 2));
  await writeFile(`bench-out/profile-${tag}.cpuprofile`, JSON.stringify(cpu.profile));
  console.log(summary);
} finally {
  await cdp.detach().catch(() => {});
  await browser.close();
}
