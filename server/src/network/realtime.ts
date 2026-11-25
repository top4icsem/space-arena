import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { SharedWorld } from '../../../shared/world.ts';
import { encodeSnapshot } from '../../../shared/codec.ts';
import { entityId, inputSeq } from '../../../shared/types.ts';
import { createRandom } from '../../../shared/prng.ts';
import type { EntityId, Controls, WireInput } from '../../../shared/types.ts';
import type { Room, RoomManager, RoomPlayer } from '../rooms.ts';
import { TickScheduler } from './ticker.ts';

export interface RealtimePlayer extends RoomPlayer {
  socket: WebSocket;
  wire: 'binary' | 'json';
  netId: EntityId;
}
interface BotController {
  id: EntityId;
  seq: number;
  random: () => number;
}
interface RealtimeSession {
  bots: BotController[];
  room: Room;
  world: SharedWorld;
  clients: Map<EntityId, RealtimePlayer>;
}
export class RealtimeRooms {
  readonly manager: RoomManager;
  readonly send: (socket: WebSocket, message: string | Buffer) => void;
  readonly sessions = new Map<string, RealtimeSession>();
  nextPlayerId = 1;
  readonly durations: number[] = [];
  readonly durationCapacity = 900;
  private lastStepMs = 0;
  get performance() {
    const sample = this.durations.slice().sort((a, b) => a - b);
    const percentile = (q: number) =>
      sample[Math.min(sample.length - 1, Math.floor(q * Math.max(0, sample.length - 1)))] ?? 0;
    return {
      n: sample.length,
      lastMs: this.lastStepMs,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      rooms: this.sessions.size,
      bots: [...this.sessions.values()].reduce((n, s) => n + s.bots.length, 0),
    };
  }
  readonly createSession: (room: Room) => void;
  readonly removeSession: (id: string) => void;
  readonly scheduler: TickScheduler;
  constructor(
    manager: RoomManager,
    send: (socket: WebSocket, message: string | Buffer) => void,
    { seed = () => randomBytes(4).readUInt32LE(0) }: { seed?: () => number } = {},
  ) {
    this.manager = manager;
    this.send = send;
    this.createSession = (room) => {
      this.sessions.set(room.id, {
        room,
        bots: [],
        world: new SharedWorld({ seed: seed(), asteroidCount: room.asteroidCount }),
        clients: new Map(),
      });
    };
    for (const room of manager.rooms.values()) this.createSession(room);
    manager.on('created', this.createSession);
    this.removeSession = (id) => {
      this.sessions.delete(id);
    };
    manager.on('removed', this.removeSession);
    this.scheduler = new TickScheduler(() => this.step());
  }
  start(): void {
    this.scheduler.start();
  }
  join(room: Room, player: Omit<RealtimePlayer, 'netId'> & { netId?: EntityId }) {
    const session = this.sessions.get(room.id);
    if (!session) throw new Error('No realtime session');
    const id = entityId(this.nextPlayerId++);
    player.netId = id;
    session.clients.set(id, { ...player, netId: id });
    session.world.addPlayer(id);
    return { netId: id, seed: session.world.seed, tickRate: 30 };
  }
  /** Bots enter the SAME input queue as humans; their IDs are independent of room rosters. */
  enableBots(room: Room, count: number): void {
    const session = this.sessions.get(room.id);
    if (!session) return;
    const target = Math.max(0, Math.min(8, Math.floor(count)));
    while (session.bots.length < target) {
      const id = entityId(this.nextPlayerId++);
      session.world.addPlayer(id);
      session.bots.push({ id, seq: 0, random: createRandom((session.world.seed ^ id) >>> 0) });
    }
    while (session.bots.length > target) {
      const bot = session.bots.pop();
      if (bot) session.world.removePlayer(bot.id);
    }
  }
  leave(room: Room, player: { netId?: EntityId }): void {
    const session = this.sessions.get(room.id);
    if (player.netId !== undefined) {
      session?.clients.delete(player.netId);
      session?.world.removePlayer(player.netId);
    }
  }
  receive(
    room: Room,
    player: { netId?: EntityId },
    input: WireInput,
    decodeControls: (mask: number) => Controls,
  ): boolean {
    if (player.netId === undefined) return false;
    return (
      this.sessions.get(room.id)?.world.queueInput(player.netId, input, decodeControls) ?? false
    );
  }
  step(): void {
    const started = performance.now();
    for (const session of this.sessions.values()) {
      const { world } = session;
      for (const bot of session.bots) {
        const own = world.players.get(bot.id);
        if (!own) continue;
        let target;
        for (const human of session.clients.values()) {
          const state = world.players.get(human.netId);
          if (state?.alive) {
            target = state;
            break;
          }
        }
        const desired = target
          ? Math.atan2(target.x - own.x, own.y - target.y)
          : (world.tick / 37 + bot.id) % 6.28;
        const difference = Math.atan2(Math.sin(desired - own.angle), Math.cos(desired - own.angle));
        const turnLeft = difference < -0.05,
          turnRight = difference > 0.05;
        const mask =
          1 | (turnLeft ? 2 : 0) | (turnRight ? 4 : 0) | (world.tick % 9 === bot.id % 9 ? 16 : 0);
        // bot.random is seeded, retained for future strategies without Math.random in physics.
        world.queueInput(bot.id, { seq: inputSeq(++bot.seq), mask }, (m) => ({
          thrust: !!(m & 1),
          turnLeft: !!(m & 2),
          turnRight: !!(m & 4),
          fire: !!(m & 16),
        }));
      }
      const events = world.step();
      for (const event of events) {
        switch (event.type) {
          case 'fired':
          case 'hit':
          case 'exploded':
          case 'respawn':
          case 'collected': {
            const payload = JSON.stringify({ v: 0, type: 'combat', event });
            for (const p of session.clients.values()) this.send(p.socket, payload);
            break;
          }
          default: {
            const _: never = event;
            throw new Error(String(_));
          }
        }
      }
      if (world.tick % 2 !== 0) continue;
      for (const p of session.clients.values()) {
        if (p.socket.readyState !== WebSocket.OPEN) continue;
        const state = world.snapshot(world.players.get(p.netId)?.ack);
        if (p.wire === 'json')
          this.send(p.socket, JSON.stringify({ v: 0, type: 'snapshot', ...state }));
        else this.send(p.socket, Buffer.from(encodeSnapshot(state)));
      }
    }
    this.lastStepMs = performance.now() - started;
    this.durations.push(this.lastStepMs);
    if (this.durations.length > this.durationCapacity) this.durations.shift();
  }
  stop(): void {
    this.scheduler.stop();
    this.manager.off('created', this.createSession);
    this.manager.off('removed', this.removeSession);
  }
}
