/**
 * requestAnimationFrame drives drawing; fixed-size simulation steps accumulate.
 * `scheduler` and `variableTimestep` exist only to run the required lab experiments.
 */
export function createLoop({
  simulate,
  render,
  onStats = () => {},
  fixedDt = 1 / 60,
  maxFrameDelta = 0.25,
  maxStepsPerFrame = 8,
  scheduler = 'raf',
  variableTimestep = false,
  blockEvery60Frames = false,
}) {
  let running = false;
  let timerId = null;
  let lastTime = null;
  let accumulator = 0;
  let frameCount = 0;
  let stepCount = 0;
  let sampleStart = null;
  let totalFrameCount = 0;
  let latestStats = { fps: 0, stepsPerSecond: 0, frameMs: 0, totalFrames: 0 };

  function tick(timestamp) {
    if (!running) return;

    if (lastTime === null) lastTime = timestamp;
    if (sampleStart === null) sampleStart = timestamp;

    const rawDelta = Math.max(0, (timestamp - lastTime) / 1000);
    const frameDelta = Math.min(rawDelta, maxFrameDelta);
    lastTime = timestamp;

    let stepsThisFrame = 0;
    if (variableTimestep) {
      if (frameDelta > 0) {
        simulate(frameDelta);
        stepsThisFrame = 1;
      }
    } else {
      accumulator += frameDelta;
      while (accumulator >= fixedDt && stepsThisFrame < maxStepsPerFrame) {
        simulate(fixedDt);
        accumulator -= fixedDt;
        stepsThisFrame++;
      }
      // Avoid the spiral of death if the machine cannot keep up with the backlog.
      if (stepsThisFrame === maxStepsPerFrame && accumulator >= fixedDt) {
        accumulator %= fixedDt;
      }
    }

    const alpha = variableTimestep ? 1 : accumulator / fixedDt;
    render(alpha, latestStats, timestamp);

    if (blockEvery60Frames && (totalFrameCount + 1) % 60 === 0) {
      const until = performance.now() + 100;
      while (performance.now() < until) {
        /* Lab 01 deliberate main-thread block */
      }
    }

    frameCount++;
    totalFrameCount++;
    stepCount += stepsThisFrame;
    const elapsedMs = timestamp - sampleStart;
    if (elapsedMs >= 1000) {
      latestStats = {
        fps: (frameCount * 1000) / elapsedMs,
        stepsPerSecond: (stepCount * 1000) / elapsedMs,
        frameMs: rawDelta * 1000,
        totalFrames: totalFrameCount,
      };
      onStats(latestStats);
      frameCount = 0;
      stepCount = 0;
      sampleStart = timestamp;
    } else {
      latestStats = { ...latestStats, frameMs: rawDelta * 1000, totalFrames: totalFrameCount };
    }

    if (scheduler === 'raf' && running) timerId = requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = null;
    sampleStart = null;
    accumulator = 0;
    frameCount = 0;
    stepCount = 0;
    if (scheduler === 'interval') {
      timerId = setInterval(() => tick(performance.now()), 16);
    } else {
      timerId = requestAnimationFrame(tick);
    }
  }

  function stop() {
    if (!running) return;
    running = false;
    if (scheduler === 'interval') clearInterval(timerId);
    else cancelAnimationFrame(timerId);
    timerId = null;
  }

  return { start, stop, isRunning: () => running, getStats: () => ({ ...latestStats }) };
}
