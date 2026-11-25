import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { SharedWorld } from '../../../shared/world.ts';
import { encodeSnapshot } from '../../../shared/codec.ts';
import { entityId } from '../../../shared/types.ts';
import type { EntityId, Controls, WireInput } from '../../../shared/types.ts';
import type { Room, RoomManager, RoomPlayer } from '../rooms.ts';
import { TickScheduler } from './ticker.ts';

export interface RealtimePlayer extends RoomPlayer {
  socket: WebSocket;
  wire: 'binary' | 'json';
  netId: EntityId;
}
interface RealtimeSession {
  room: Room;
  world: SharedWorld;
  clients: Map<EntityId, RealtimePlayer>;
}
export class RealtimeRooms {
  readonly manager: RoomManager;
  readonly send: (socket: WebSocket, message: string | Buffer) => void;
  readonly sessions = new Map<string, RealtimeSession>();
  nextPlayerId = 1;
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
    for (const session of this.sessions.values()) {
      const { world } = session;
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
  }
  stop(): void {
    this.scheduler.stop();
    this.manager.off('created', this.createSession);
    this.manager.off('removed', this.removeSession);
  }
}
