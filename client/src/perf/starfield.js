/** Optional experiment only: worker startup may cost MORE than generating 164 stars. */
export function generateStarsInWorker({ width = 1100, height = 680, seed = 103053 } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./starfield.worker.js', import.meta.url), {
      type: 'module',
    });
    const started = performance.now();
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Worker timed out'));
    }, 4000);
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.onmessage = ({ data }) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ stars: data.values, totalMs: performance.now() - started, workerMs: data.timeMs });
    };
    worker.postMessage({ seed, width, height });
  });
}
