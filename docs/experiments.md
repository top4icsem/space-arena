# Lab 01 — Reproduce the three experiments in Chrome

The URL examples assume the Vite dev server is running at `http://localhost:5173`.

## Preparation

1. Run `npm install && npm run dev` from the project root.
2. Open Chrome DevTools → Performance and keep Console available.
3. For repeatable results, close unnecessary tabs, use the same viewport and browser version, and repeat each scenario 3 times.
4. FPS and steps/s in HUD are averaged over about 1 second; frame time is the latest frame-to-frame delta, not time spent in the physics function.

## A. Baseline, then block every 60th frame

- Visit `http://localhost:5173/` and observe FPS, STEPS/S, FRAME TIME for 10 seconds. Capture screenshot.
- Visit `http://localhost:5173/?experiment=block`. Each 60th render contains a 100 ms `while` busy-wait. Capture screenshot and time a 10-second run.
- Note mean FPS, max frame gap, and whether movement visibly freezes. The CPU cannot handle another task, a promise reaction, or rAF while the current callback occupies the call stack.
- Return to `/` to restore the correct implementation.

## B. `setInterval(16)` in foreground and in a real background tab

- Run normal rAF for 10 seconds; record FPS and jitter (use Performance trace or the snippet below).
- Run `/?experiment=interval` for 10 seconds; record the same indicators.
- Open a **second tab in the same browser window**. While watching the original page from DevTools or the counter in the console, switch away for **5 seconds**, then switch back. Compare how many callbacks happened in each mode.
- Repeat with the same browser/device; record whether the page's `document.hidden` is true when not foregrounded.
- Restore normal `/` URL.

Optional sampling snippet: paste into Console, run, and inspect the result:

```js
const measure = async (durationMs = 10000) => {
  const samples = [];
  const started = performance.now();
  while (performance.now() - started < durationMs) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    samples.push(window.__spaceArenaDebug.getStats());
  }
  const average = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  const values = samples.slice(25);
  console.table({
    meanFPS: average(values.map((s) => s.fps)),
    meanStepsPerSecond: average(values.map((s) => s.stepsPerSecond)),
    meanFrameMs: average(values.map((s) => s.frameMs)),
    maxFrameMs: Math.max(...values.map((s) => s.frameMs)),
  });
};
await measure();
```

**Background caveat:** some automated/headless environments do not update `document.hidden` properly. The required real-background experiment should be done in an ordinary, visible Chrome window.

## C. Fixed step vs variable timestep, normal vs 6× CPU slowdown

For each URL below, wait until a yellow banner says the **5-second benchmark finished**, then copy the exact `x`, `y`, and speed values from the banner/Console:

1. `http://localhost:5173/?autothrust=1` (fixed step, normal CPU).
2. `http://localhost:5173/?experiment=variable&autothrust=1` (variable step, normal CPU).
3. Open DevTools → Performance → CPU throttling → `6× slowdown` and repeat the two URLs.

Each run uses an identical initial ship and holds thrust for exactly 5 seconds of **simulated time**. It freezes the final numerical state after completing the benchmark. This avoids reaction-time errors from manually holding W, and isolates numerical integration from input timing.

The game uses wrap-around (680 world-units tall), so a Y coordinate near zero does **not** mean it travelled only 60 pixels — it crossed the top boundary and re-entered from the bottom.

## Suggested evidence to submit

- One normal-game screenshot (HUD shows FPS and 60 steps/s).
- One busy-wait Performance trace with the ~100 ms main-thread block.
- A table with 10-second timer/rAF jitter and 5-second genuine background behavior.
- A table of final ship positions for fixed and variable steps, both CPU conditions.
- A 2–4 sentence event-loop explanation per experiment.
