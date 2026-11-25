import { ARENA } from '../sim/arena.js';

/** Actual asset-completion fraction painted into the game CANVAS (not CSS fake progress). */
export function drawLoading(surface, { completed = 0, total = 1, file = 'Connecting...' } = {}) {
  surface.beginFrame();
  const ctx = surface.ctx;
  const { width, height } = ARENA;
  const fraction = Math.max(0, Math.min(1, completed / total));
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#08172e');
  background.addColorStop(1, '#111d37');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#1d3f59';
  for (let x = 0; x <= width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#86e9e4';
  ctx.font = '700 16px ui-monospace, monospace';
  ctx.fillText('SPACE ARENA  //  ASSET PIPELINE', width / 2, 258);
  ctx.fillStyle = '#f3f9ff';
  ctx.font = '800 38px system-ui, sans-serif';
  ctx.fillText('Initializing sector...', width / 2, 317);
  const barX = width / 2 - 245;
  const barY = 362;
  ctx.fillStyle = '#1b3044';
  ctx.fillRect(barX, barY, 490, 15);
  ctx.fillStyle = '#66e9e7';
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#50e7d9';
  ctx.fillRect(barX, barY, 490 * fraction, 15);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#a9c9d5';
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillText(
    `${completed} / ${total} RESOURCES  ·  ${Math.round(fraction * 100)}%`,
    width / 2,
    412,
  );
  ctx.fillStyle = '#6987a0';
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillText(String(file).slice(-67), width / 2, 445);
}

export function drawLoadError(surface, message) {
  drawLoading(surface, { completed: 0, total: 1, file: 'Asset error — retry to continue' });
  const ctx = surface.ctx;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb4a8';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(String(message).slice(0, 85), ARENA.width / 2, 505);
}
