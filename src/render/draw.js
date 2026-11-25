import { ARENA } from '../sim/arena.js';
import { interpolateShip } from './interpolate.js';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildBackdrop() {
  const canvas = document.createElement('canvas');
  canvas.width = ARENA.width;
  canvas.height = ARENA.height;
  const ctx = canvas.getContext('2d');
  const { width, height } = ARENA;

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#0b1830');
  background.addColorStop(0.52, '#091426');
  background.addColorStop(1, '#091020');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const bloomA = ctx.createRadialGradient(200, 140, 0, 200, 140, 440);
  bloomA.addColorStop(0, 'rgba(37, 76, 138, .24)');
  bloomA.addColorStop(1, 'rgba(37, 76, 138, 0)');
  ctx.fillStyle = bloomA;
  ctx.fillRect(0, 0, width, height);
  const bloomB = ctx.createRadialGradient(950, 560, 0, 950, 560, 370);
  bloomB.addColorStop(0, 'rgba(60, 66, 153, .17)');
  bloomB.addColorStop(1, 'rgba(60, 66, 153, 0)');
  ctx.fillStyle = bloomB;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(114, 154, 211, .055)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 44) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, height); ctx.stroke();
  }
  for (let y = 0; y <= height; y += 44) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(width, y + 0.5); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(116, 182, 226, .09)';
  ctx.setLineDash([5, 12]);
  ctx.lineWidth = 1;
  for (const radius of [120, 245, 370]) {
    ctx.beginPath(); ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(width / 2 - 18, height / 2);
  ctx.lineTo(width / 2 + 18, height / 2);
  ctx.moveTo(width / 2, height / 2 - 18);
  ctx.lineTo(width / 2, height / 2 + 18);
  ctx.strokeStyle = 'rgba(91, 164, 218, .17)';
  ctx.stroke();

  const random = seededRandom(103053);
  for (let i = 0; i < 164; i++) {
    const x = random() * width;
    const y = random() * height;
    const size = 0.45 + random() * 1.5;
    const alpha = 0.13 + random() * 0.6;
    ctx.fillStyle = `rgba(178, 213, 255, ${alpha})`;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    if (i % 23 === 0) {
      ctx.strokeStyle = `rgba(174, 207, 246, ${alpha * .7})`;
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(75, 154, 210, .12)';
  ctx.setLineDash([7, 8]);
  ctx.strokeRect(15.5, 15.5, width - 31, height - 31);
  ctx.setLineDash([]);
  return canvas;
}

function drawThrust(ctx, timestamp) {
  const flicker = 2 + Math.sin(timestamp / 65) * 3;
  ctx.save();
  ctx.shadowColor = '#24bdfa';
  ctx.shadowBlur = 27;
  const flame = ctx.createLinearGradient(0, 13, 0, 56);
  flame.addColorStop(0, '#f8fdff');
  flame.addColorStop(0.25, '#70f6f2');
  flame.addColorStop(0.7, '#2f94f7');
  flame.addColorStop(1, 'rgba(100, 50, 255, 0)');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-7, 15);
  ctx.quadraticCurveTo(-5, 32, 0, 51 + flicker);
  ctx.quadraticCurveTo(6, 34, 7, 15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawOneShip(ctx, x, y, angle, thrusting, timestamp) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.strokeStyle = 'rgba(85, 211, 250, .18)';
  ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(0, 0, 39, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(85, 211, 250, .32)';
  ctx.beginPath(); ctx.arc(0, 0, 39, Math.PI * 1.72, Math.PI * 1.93); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 39, Math.PI * 0.72, Math.PI * .93); ctx.stroke();

  if (thrusting) drawThrust(ctx, timestamp);

  ctx.shadowColor = '#4bc6ff';
  ctx.shadowBlur = 22;
  const hull = ctx.createLinearGradient(-21, -30, 22, 25);
  hull.addColorStop(0, '#bedafa');
  hull.addColorStop(0.44, '#edfaff');
  hull.addColorStop(1, '#66a6d5');
  ctx.fillStyle = hull;
  ctx.strokeStyle = '#91e5ff';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(21, 22);
  ctx.lineTo(5, 14);
  ctx.lineTo(0, 9);
  ctx.lineTo(-5, 14);
  ctx.lineTo(-21, 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#123452';
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(7, 6);
  ctx.quadraticCurveTo(0, 13, -7, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#68ebf9';
  ctx.beginPath(); ctx.ellipse(0, -3, 3.2, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#247ea7';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-14, 15); ctx.lineTo(-7, 9); ctx.moveTo(14, 15); ctx.lineTo(7, 9); ctx.stroke();
  ctx.fillStyle = '#7ef2ff';
  ctx.fillRect(-4, 13, 8, 4);
  ctx.restore();
}

export function createRenderer(surface) {
  const backdrop = buildBackdrop();
  const { ctx } = surface;

  return {
    render(previous, current, alpha, timestamp) {
      const ship = interpolateShip(previous, current, alpha);
      surface.beginFrame();
      ctx.drawImage(backdrop, 0, 0);
      // Wrapped ghost copies avoid a visual pop when the ship touches a border.
      for (const dx of [-ARENA.width, 0, ARENA.width]) {
        for (const dy of [-ARENA.height, 0, ARENA.height]) {
          drawOneShip(ctx, ship.x + dx, ship.y + dy, ship.angle, ship.thrusting, timestamp);
        }
      }
    },
  };
}
