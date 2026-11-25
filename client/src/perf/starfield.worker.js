// Web Worker experiment: deterministic backdrop generation; no DOM or canvas calls.
self.onmessage = ({ data }) => {
  const start = performance.now();
  let state = data.seed >>> 0 || 103053;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const values = new Float32Array(164 * 4);
  for (let i = 0; i < 164; i++) {
    values[i * 4] = random() * data.width;
    values[i * 4 + 1] = random() * data.height;
    values[i * 4 + 2] = 0.45 + random() * 1.5;
    values[i * 4 + 3] = 0.13 + random() * 0.6;
  }
  self.postMessage({ values, timeMs: performance.now() - start }, [values.buffer]);
};
