import { ARENA } from '../sim/arena.js';

/** Size the backing buffer by devicePixelRatio, but draw in world coordinates. */
export function createCanvasSurface(canvas, arena = ARENA) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Your browser does not support Canvas 2D');
  let dpr = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const nextWidth = Math.round(width * dpr);
    const nextHeight = Math.round(height * dpr);
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    scale = Math.min(width / arena.width, height / arena.height);
    offsetX = (width - arena.width * scale) / 2;
    offsetY = (height - arena.height * scale) / 2;
  }

  function beginFrame() {
    // Update on DPR changes even when CSS dimensions stay unchanged.
    if (Math.min(window.devicePixelRatio || 1, 3) !== dpr) resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#060d1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  return {
    ctx,
    beginFrame,
    dispose() {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    },
  };
}
