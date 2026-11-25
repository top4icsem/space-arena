import { randomBytes } from 'node:crypto';
import { SharedWorld } from '../../../shared/world.js';
import { encodeSnapshot } from '../../../shared/codec.js';
import { WebSocket } from 'ws';
import { TickScheduler } from './ticker.js';
export class RealtimeRooms {
  constructor(manager, send, { seed = () => randomBytes(4).readUInt32LE(0) } = {}) {
    this.manager = manager;
    this.send = send;
    this.sessions = new Map();
    this.nextPlayerId = 1;
    this.createSession = (room) => {
      this.sessions.set(room.id, {
        room,
        world: new SharedWorld({ seed: seed(), asteroidCount: room.asteroidCount }),
        clients: new Map(),
      });
    };
    for (const room of manager.rooms.values()) this.createSession(room);
    manager.on('created', this.createSession);
    this.removeSession = (id) => this.sessions.delete(id);
    manager.on('removed', this.removeSession);
    this.scheduler = new TickScheduler(() => this.step());
  }
  start() {
    this.scheduler.start();
  }
  join(room, player) {
    const session = this.sessions.get(room.id);
    if (!session) throw new Error('No realtime session');
    const id = this.nextPlayerId++;
    player.netId = id;
    session.clients.set(id, player);
    session.world.addPlayer(id);
    return { netId: id, seed: session.world.seed, tickRate: 30 };
  }
  leave(room, player) {
    const session = this.sessions.get(room.id);
    session?.clients.delete(player.netId);
    session?.world.removePlayer(player.netId);
  }
  receive(room, player, input, decodeControls) {
    return this.sessions.get(room.id)?.world.queueInput(player.netId, input, decodeControls);
  }
  step() {
    for (const session of this.sessions.values()) {
      const { world } = session;
      const events = world.step();
      for (const event of events) {
        if (['fired', 'hit', 'exploded', 'respawn', 'collected'].includes(event.type)) {
          const payload = JSON.stringify({ v: 0, type: 'combat', event });
          for (const p of session.clients.values()) this.send(p.socket, payload);
        }
      }
      if (world.tick % 2 !== 0) continue; // 30 sim ticks/s, 15 snapshots/s
      for (const p of session.clients.values()) {
        if (p.socket.readyState !== WebSocket.OPEN) continue;
        const state = world.snapshot(world.players.get(p.netId)?.ack ?? 0);
        if (p.wire === 'json')
          this.send(p.socket, JSON.stringify({ v: 0, type: 'snapshot', ...state }));
        else this.send(p.socket, Buffer.from(encodeSnapshot(state)));
      }
    }
  }
  stop() {
    this.scheduler.stop();
    this.manager.off('created', this.createSession);
    this.manager.off('removed', this.removeSession);
  }
}
