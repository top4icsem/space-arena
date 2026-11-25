# ЛР №7 — план 5-хвилинного захисту

**0:00–0:45.** Покажіть `npm run check` і висновок Vitest: ≥60 тестів, `shared/` coverage ≥85%, CI зелений у GitHub Actions.

**0:45–1:50.** Запустіть `npm run dev`, відкрийте `/?bots=8` (порт Vite з термінала), зайдіть у Orion Belt. Скажіть, що боти, як і люди, кладуть `seq`-input у серверну чергу; координати з клієнта сервер не приймає.

**1:50–2:50.** Відкрийте друге вікно, зайдіть у ту саму кімнату, покажіть рух чужого корабля і чат. Нагадайте, що Playwright автоматизує цю перевірку двома окремими browser contexts.

**2:50–3:35.** Покажіть один property-based тест у `shared/test/engine.vitest.test.ts`: `advanceInto` == `advance` та input `DataView` roundtrip.

**3:35–4:20.** Покажіть реальний графік `docs/lab07-node-world-benchmark.png`, назвіть виміряні p50/p95/p99. Поясніть, що це серверний benchmark, а кадри в браузері вимірюються окремо. Відкрийте власний Chrome DevTools Flame Chart після локального профілювання.

**4:20–5:00.** Відповіді на 2–3 Reflection: GC і алокації, пули, hidden classes, Web Worker, навіщо клієнт/сервер порівнюються.

## Підготовка перед показом

```bash
npm install
npx playwright install chromium
npm run check
npm run test:e2e
npm run dev
```

Вимірювання 30 секунд у Chrome (під час запущеного `npm run dev`):

```bash
npm run bench:browser -- after
node scripts/render-flame.mjs bench-out/profile-after.cpuprofile
```

Для порівняння `before` потрібен окремий git worktree з тегом `lab-06`, а не перейменування нового запуску в `before`.
