import { ARENA } from '../sim/arena.js';
import { interpolateShip, lerpWrapped } from './interpolate.js';

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
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(116, 182, 226, .09)';
  ctx.setLineDash([5, 12]);
  ctx.lineWidth = 1;
  for (const radius of [120, 245, 370]) {
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    ctx.stroke();
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
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (i % 23 === 0) {
      ctx.strokeStyle = `rgba(174, 207, 246, ${alpha * 0.7})`;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.stroke();
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
  ctx.beginPath();
  ctx.arc(0, 0, 39, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(85, 211, 250, .32)';
  ctx.beginPath();
  ctx.arc(0, 0, 39, Math.PI * 1.72, Math.PI * 1.93);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 39, Math.PI * 0.72, Math.PI * 0.93);
  ctx.stroke();

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
  ctx.beginPath();
  ctx.ellipse(0, -3, 3.2, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#247ea7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, 15);
  ctx.lineTo(-7, 9);
  ctx.moveTo(14, 15);
  ctx.lineTo(7, 9);
  ctx.stroke();
  ctx.fillStyle = '#7ef2ff';
  ctx.fillRect(-4, 13, 8, 4);
  ctx.restore();
}

function drawAsteroid(ctx, entity, x, y, timestamp) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(entity.rotation + timestamp * 0.00012 * (entity.guided ? -1 : 1));
  const r = entity.radius;
  ctx.shadowColor = entity.guided ? '#ff835c' : '#90aed5';
  ctx.shadowBlur = entity.guided ? 24 : 10;
  const stone = ctx.createLinearGradient(-r, -r, r, r);
  stone.addColorStop(0, entity.guided ? '#a45743' : '#718ba3');
  stone.addColorStop(0.5, entity.guided ? '#582f41' : '#334b68');
  stone.addColorStop(1, '#101a2e');
  ctx.fillStyle = stone;
  ctx.strokeStyle = entity.guided ? '#ffac7a' : '#a3b9cc';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const angle = (i * Math.PI * 2) / 9;
    const radius = r * (0.82 + 0.15 * Math.sin(i * 7.4 + entity.id));
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = entity.guided ? '#f69c72' : '#728ba5';
  ctx.beginPath();
  ctx.ellipse(-r * 0.21, -r * 0.1, r * 0.23, r * 0.12, 0.4, 0, Math.PI * 2);
  ctx.moveTo(r * 0.12, r * 0.25);
  ctx.arc(r * 0.1, r * 0.21, r * 0.2, 0, 1.9 * Math.PI);
  ctx.stroke();
  if (entity.guided) {
    ctx.fillStyle = '#ffac6c';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBullet(ctx, entity, x, y) {
  ctx.save();
  ctx.shadowBlur = entity.guided ? 25 : 15;
  ctx.shadowColor = entity.team === 'enemy' ? '#ff697e' : entity.guided ? '#d6b3ff' : '#82f9f3';
  ctx.fillStyle = entity.team === 'enemy' ? '#ff8191' : entity.guided ? '#d8aeff' : '#92fff2';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = entity.guided ? 3.5 : 2.5;
  const direction = entity.velocity.normalized();
  ctx.beginPath();
  ctx.moveTo(
    x - direction.x * (entity.guided ? 17 : 13),
    y - direction.y * (entity.guided ? 17 : 13),
  );
  ctx.lineTo(x + direction.x * 5, y + direction.y * 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, entity.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPickup(ctx, x, y, timestamp) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(timestamp / 230) * 0.14;
  ctx.scale(pulse, pulse);
  ctx.rotate(Math.PI / 4);
  ctx.shadowColor = '#80ffb8';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#163b37';
  ctx.strokeStyle = '#88ffc9';
  ctx.lineWidth = 3;
  ctx.fillRect(-12, -12, 24, 24);
  ctx.strokeRect(-12, -12, 24, 24);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#8dffbd';
  ctx.fillRect(-3, -9, 6, 18);
  ctx.fillRect(-9, -3, 18, 6);
  ctx.restore();
}

function drawEntity(ctx, entity, alpha, timestamp) {
  const x = lerpWrapped(entity.previousPosition.x, entity.position.x, alpha, ARENA.width);
  const y = lerpWrapped(entity.previousPosition.y, entity.position.y, alpha, ARENA.height);
  // Border ghost copies preserve continuity on the toroidal playfield.
  for (const dx of [-ARENA.width, 0, ARENA.width]) {
    for (const dy of [-ARENA.height, 0, ARENA.height]) {
      const px = x + dx;
      const py = y + dy;
      if (px < -65 || px > ARENA.width + 65 || py < -65 || py > ARENA.height + 65) continue;
      if (entity.kind === 'ship') {
        ctx.save();
        if (entity.invincibleFor > 0)
          ctx.globalAlpha = 0.76 + 0.24 * (0.5 + 0.5 * Math.sin(timestamp / 120));
        if (entity.team === 'enemy') ctx.filter = 'hue-rotate(148deg) saturate(1.5)';
        drawOneShip(ctx, px, py, entity.angle, entity.thrusting, timestamp);
        ctx.restore();
      } else if (entity.kind === 'asteroid') drawAsteroid(ctx, entity, px, py, timestamp);
      else if (entity.kind === 'bullet') drawBullet(ctx, entity, px, py);
      else if (entity.kind === 'pickup') drawPickup(ctx, px, py, timestamp);
      else if (entity.kind === 'particle') {
        ctx.save();
        ctx.globalAlpha = entity.ttl.fraction;
        ctx.fillStyle = entity.color;
        ctx.shadowColor = entity.color;
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.arc(px, py, entity.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

export function createRenderer(surface) {
  const backdrop = buildBackdrop();
  const { ctx } = surface;

  return {
    render(previous, current, alpha, timestamp, world = null) {
      surface.beginFrame();
      ctx.drawImage(backdrop, 0, 0);
      if (world) {
        // Render the world snapshot rather than reimplementing the simulation in Canvas.
        for (const entity of world) {
          if (entity.kind !== 'ship') drawEntity(ctx, entity, alpha, timestamp);
        }
        for (const entity of world.ofKind('ship')) drawEntity(ctx, entity, alpha, timestamp);
      } else {
        // Lab 01 controlled benchmarking remains available at ?autothrust=1.
        const ship = interpolateShip(previous, current, alpha);
        for (const dx of [-ARENA.width, 0, ARENA.width]) {
          for (const dy of [-ARENA.height, 0, ARENA.height]) {
            drawOneShip(ctx, ship.x + dx, ship.y + dy, ship.angle, ship.thrusting, timestamp);
          }
        }
      }
    },
  };
}
