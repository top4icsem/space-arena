import { STEP, ARENA, advance, wrapCoordinate } from '../../../shared/flight.ts';
import { entityId, inputSeq } from '../../../shared/types.ts';
import type {
  Controls,
  EntityId,
  FlightState,
  InputSeq,
  PlayerRecord,
  Snapshot,
  Vector2,
} from '../../../shared/types.ts';
import { controlsToMask } from '../../../shared/codec.ts';
import { lerpWrapped, lerpAngle } from '../render/interpolate.js';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const interpolated = <
  T extends FlightState | { x: number; y: number; vx?: number; vy?: number; angle?: number },
>(
  a: T,
  b: T,
  t: number,
): T => ({
  ...b,
  x: lerpWrapped(a.x, b.x, t, ARENA.width),
  y: lerpWrapped(a.y, b.y, t, ARENA.height),
  vx: lerp(a.vx ?? 0, b.vx ?? 0, t),
  vy: lerp(a.vy ?? 0, b.vy ?? 0, t),
  angle: lerpAngle(a.angle ?? 0, b.angle ?? 0, t),
});
const shortest = (a: number, b: number, span: number): number => {
  let d = a - b;
  if (d > span / 2) d -= span;
  if (d < -span / 2) d += span;
  return d;
};
const drawn = (
  kind: 'ship' | 'bullet' | 'asteroid' | 'pickup',
  obj: {
    id?: number;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    angle?: number;
    radius?: number;
  },
) => ({
  ...obj,
  kind,
  team: kind === 'ship' ? 'enemy' : 'player',
  radius: obj.radius || 21,
  position: { x: obj.x, y: obj.y },
  previousPosition: { x: obj.x, y: obj.y },
  velocity: { x: obj.vx ?? 0, y: obj.vy ?? 0 },
});
interface ConnectionSender {
  status: string;
  sendInput(seq: InputSeq, mask: number): number;
  send(type: string, detail?: Record<string, unknown>): boolean;
}
interface PendingInput {
  seq: InputSeq;
  controls: Controls;
}
interface GhostBullet {
  id: number;
  ownerId: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  guided: boolean;
  ttl: number;
}
interface NetDraw {
  kind: 'ship' | 'bullet' | 'asteroid' | 'pickup';
  team: string;
  radius: number;
  position: Vector2;
  previousPosition: Vector2;
  velocity: Vector2;
  [key: string]: unknown;
}
interface NetworkOptions {
  prediction?: boolean;
  divergence?: boolean;
  interpolationMs?: number;
  latency?: number;
  jitter?: number;
  loss?: number;
  random?: () => number;
}
export class NetworkGame {
  connection: ConnectionSender;
  prediction: boolean;
  divergence: boolean;
  interpolationMs: number;
  latency: number;
  jitter: number;
  loss: number;
  random: () => number;
  id: EntityId;
  nextSeq: number;
  accumulator: number;
  pending: PendingInput[];
  predicted: PlayerRecord | null;
  authoritative: PlayerRecord | null;
  frames: Snapshot[];
  offset: { x: number; y: number };
  lastRx: number;
  rtt: number | null;
  lastCorrection: number;
  ghostBullets: GhostBullet[];
  scheduled: Set<ReturnType<typeof setTimeout>>;
  bytesOut: number;
  bytesIn: number;
  previousBytesOut: number;
  previousBytesIn: number;
  bytesUpdated: number;
  outRate: number;
  inRate: number;
  probeAt: number;
  eventBus: EventTarget | null;
  lastFireAt: number;

  constructor(
    connection: ConnectionSender,
    {
      prediction = true,
      divergence = false,
      interpolationMs = 120,
      latency = 0,
      jitter = 0,
      loss = 0,
      random = Math.random,
    }: NetworkOptions = {},
  ) {
    this.connection = connection;
    this.prediction = prediction;
    this.divergence = divergence;
    this.interpolationMs = interpolationMs;
    this.latency = Math.max(0, latency);
    this.jitter = Math.max(0, jitter);
    this.loss = Math.max(0, Math.min(1, loss));
    this.random = random;
    this.id = entityId(0);
    this.nextSeq = 1;
    this.accumulator = 0;
    this.pending = [];
    this.predicted = null;
    this.authoritative = null;
    this.frames = [];
    this.offset = { x: 0, y: 0 };
    this.lastRx = 0;
    this.rtt = null;
    this.lastCorrection = 0;
    this.ghostBullets = [];
    this.scheduled = new Set();
    this.bytesOut = 0;
    this.bytesIn = 0;
    this.previousBytesOut = 0;
    this.previousBytesIn = 0;
    this.bytesUpdated = performance.now();
    this.outRate = 0;
    this.inRate = 0;
    this.probeAt = 0;
    this.eventBus = null;
    this.lastFireAt = -100;
  }
  reset() {
    for (const task of this.scheduled) clearTimeout(task);
    this.scheduled.clear();
    this.id = entityId(0);
    this.nextSeq = 1;
    this.accumulator = 0;
    this.pending = [];
    this.predicted = null;
    this.authoritative = null;
    this.frames = [];
    this.offset = { x: 0, y: 0 };
    this.ghostBullets = [];
    this.lastRx = 0;
    this.rtt = null;
    this.lastCorrection = 0;
  }
  joined(payload: { netId: number }): void {
    this.reset();
    this.id = entityId(payload.netId);
  }
  schedule(fn: () => void, extraDelay = 0) {
    // Artificial network latency and jitter are strictly transport-side, never in integrate().
    const ms = Math.max(0, this.latency / 2 + (this.random() * 2 - 1) * this.jitter + extraDelay);
    if (ms < 1) {
      fn();
      return;
    }
    const task = setTimeout(() => {
      this.scheduled.delete(task);
      fn();
    }, ms);
    this.scheduled.add(task);
  }
  receive(payload: Snapshot, byteLength: number) {
    if (!this.id) return;
    this.bytesIn += byteLength;
    if (this.random() < this.loss) return; // demo: dropped snapshot
    this.schedule(() => this.applySnapshot(payload));
  }
  applySnapshot(frame: Snapshot) {
    const fresh = this.frames.at(-1);
    if (fresh && frame.tick <= fresh.tick) return; // old jittered snapshot
    this.lastRx = performance.now();
    this.frames.push(frame);
    if (this.frames.length > 22) this.frames.shift();
    const own = frame.players.find((p) => p.id === this.id);
    if (!own) return;
    this.authoritative = own;
    const before = this.getVisualState();
    this.pending = this.pending.filter((entry) => entry.seq > frame.ack);
    if (!this.prediction || !own.alive) this.predicted = { ...own };
    else {
      let reconstructed = { ...own };
      for (const entry of this.pending)
        reconstructed = this.predictStep(reconstructed, entry.controls);
      this.predicted = reconstructed;
    }
    if (!before || !own.alive) this.offset = { x: 0, y: 0 };
    else {
      const dx = shortest(before.x, this.predicted.x, ARENA.width);
      const dy = shortest(before.y, this.predicted.y, ARENA.height);
      this.lastCorrection = Math.hypot(dx, dy);
      this.offset = { x: dx, y: dy };
    }
  }
  predictStep(state: PlayerRecord, controls: Controls): PlayerRecord {
    const next = advance(state, controls, STEP);
    // Deliberately BAD demonstration: ?diverge=1 / toggle. Disabled in normal operation.
    return {
      ...state,
      ...next,
      x: this.divergence ? wrapCoordinate(next.x + (this.random() - 0.5) * 8, ARENA.width) : next.x,
    };
  }
  simulate(dt: number, controls: Controls): void {
    this.offset.x *= Math.exp(-dt / 0.1);
    this.offset.y *= Math.exp(-dt / 0.1);
    for (const bullet of this.ghostBullets) {
      bullet.x = wrapCoordinate(bullet.x + bullet.vx * dt, ARENA.width);
      bullet.y = wrapCoordinate(bullet.y + bullet.vy * dt, ARENA.height);
      bullet.ttl -= dt;
    }
    this.ghostBullets = this.ghostBullets.filter((b) => b.ttl > 0);
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      if (!this.id) continue;
      const mask = controlsToMask(controls),
        seq = inputSeq(this.nextSeq++);
      if (this.predicted && this.prediction && this.authoritative?.alive) {
        this.pending.push({ seq, controls: { ...controls } });
        this.predicted = this.predictStep(this.predicted, controls);
      }
      if (this.pending.length > 120) this.pending.splice(0, this.pending.length - 120);
      if (controls.fire && this.predicted && this.authoritative?.alive) this.localBullet(controls);
      if (this.random() >= this.loss) {
        this.schedule(() => {
          if (this.connection.status === 'connected') {
            const bytes = this.connection.sendInput(seq, mask);
            this.bytesOut += bytes || 0;
          }
        });
      }
    }
    const now = performance.now();
    if (this.id && now - this.probeAt > 1000 && this.connection.status === 'connected') {
      this.probeAt = now;
      this.connection.send('probe', { sent: now });
    }
    if (now - this.bytesUpdated > 1000) {
      const seconds = (now - this.bytesUpdated) / 1000;
      this.inRate = Math.round((this.bytesIn - this.previousBytesIn) / seconds);
      this.outRate = Math.round((this.bytesOut - this.previousBytesOut) / seconds);
      this.previousBytesIn = this.bytesIn;
      this.previousBytesOut = this.bytesOut;
      this.bytesUpdated = now;
    }
  }
  localBullet(controls: Controls): void {
    if (performance.now() - this.lastFireAt < (controls.guided ? 360 : 190)) return;
    this.lastFireAt = performance.now();
    const p = this.predicted;
    if (!p) return;
    const sx = Math.sin(p.angle),
      sy = -Math.cos(p.angle);
    this.ghostBullets.push({
      id: -this.nextSeq,
      ownerId: this.id,
      x: wrapCoordinate(p.x + sx * 30, ARENA.width),
      y: wrapCoordinate(p.y + sy * 30, ARENA.height),
      vx: p.vx + sx * 520,
      vy: p.vy + sy * 520,
      guided: Boolean(controls.guided),
      ttl: 0.24,
    });
    this.eventBus?.dispatchEvent(
      new CustomEvent('fired', { detail: { team: 'player', guided: controls.guided } }),
    );
  }
  getVisualState(): PlayerRecord | null {
    if (!this.predicted) return null;
    return {
      ...this.predicted,
      x: wrapCoordinate(this.predicted.x + this.offset.x, ARENA.width),
      y: wrapCoordinate(this.predicted.y + this.offset.y, ARENA.height),
    };
  }
  interpolate(frameA: Snapshot | null, frameB: Snapshot | null, t: number): NetDraw[] | null {
    const earlier = frameA || frameB,
      later = frameB || earlier;
    if (!earlier || !later) return null;
    const objects: NetDraw[] = [];
    for (const p of later.players) {
      if (p.id === this.id || !p.alive) continue;
      const a = earlier.players.find((o) => o.id === p.id) || p;
      objects.push(drawn('ship', interpolated(a, p, t)));
    }
    for (const b of later.bullets) {
      const a = earlier.bullets.find((o) => o.id === b.id) || b;
      const projectile = drawn('bullet', interpolated(a, b, t));
      projectile.team = b.ownerId === this.id ? 'player' : 'enemy';
      objects.push(projectile);
    }
    for (const a of later.asteroids) {
      const earlierRock = earlier.asteroids.find((o) => o.id === a.id) || a;
      objects.push(drawn('asteroid', interpolated(earlierRock, a, t)));
    }
    for (const p of later.pickups || []) objects.push(drawn('pickup', p));
    return objects;
  }
  getWorld() {
    if (!this.frames.length) return { [Symbol.iterator]: function* () {}, *ofKind() {} };
    const latest = this.frames.at(-1);
    if (!latest) return { [Symbol.iterator]: function* () {}, *ofKind() {} };
    // Advance along the tick timeline continuously between packet arrivals.
    // The historical 120 ms buffer normally keeps the target bracketed by snapshots.
    const tickMs = 1000 / 30;
    const progressed = Math.min(2.5, Math.max(0, (performance.now() - this.lastRx) / tickMs));
    const targetTick = latest.tick + progressed - this.interpolationMs / tickMs;
    let a: Snapshot = this.frames[0] ?? latest,
      b: Snapshot = latest;
    for (let i = 1; i < this.frames.length; i++) {
      const current = this.frames[i];
      if (current && current.tick >= targetTick) {
        a = this.frames[i - 1] ?? current;
        b = current;
        break;
      }
    }
    const t =
      a.tick === b.tick ? 1 : Math.min(1, Math.max(0, (targetTick - a.tick) / (b.tick - a.tick)));
    const entities = this.interpolate(a, b, t) || [];
    for (const ghost of this.ghostBullets) entities.push(drawn('bullet', ghost));
    const own = this.getVisualState();
    if (own && own.alive) {
      const self = drawn('ship', own);
      self.team = 'player';
      entities.push(self);
    }
    return {
      [Symbol.iterator]: function* () {
        yield* entities;
      },
      *ofKind(kind: 'ship' | 'bullet' | 'asteroid' | 'pickup') {
        yield* entities.filter((entity) => entity.kind === kind);
      },
    };
  }
  get hud() {
    const latest = this.frames.at(-1);
    return {
      score: this.authoritative?.score ?? 0,
      hp: this.authoritative?.hp ?? 0,
      maxHp: 3,
      respawnIn: this.authoritative?.respawn ?? 0,
      bullets: latest?.bullets.length ?? 0,
      asteroids: latest?.asteroids.length ?? 0,
    };
  }
  get stats() {
    return {
      rtt: this.rtt,
      age: this.lastRx ? Math.round(performance.now() - this.lastRx) : null,
      outRate: this.outRate,
      inRate: this.inRate,
      queued: this.pending.length,
      correction: this.lastCorrection,
      prediction: this.prediction,
      divergence: this.divergence,
    };
  }
}
