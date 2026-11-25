import { EventEmitter } from 'node:events';
import type { EntityId } from '../../shared/types.ts';

export type RoomEvent =
  | {
      readonly t: number;
      readonly type: 'join' | 'leave';
      readonly room: string;
      readonly player: string;
      readonly name: string;
    }
  | {
      readonly t: number;
      readonly type: 'chat';
      readonly room: string;
      readonly player: string;
      readonly name: string;
      readonly text: string;
    };
export interface RoomPlayer {
  id: string;
  name: string;
  netId?: EntityId;
  wire?: 'binary' | 'json';
}
export interface RoomInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly maxPlayers: number;
  readonly asteroidCount: number;
  readonly asteroidRespawnSeconds: number;
}
export interface RoomOptions extends Partial<RoomInfo> {
  readonly name: string;
  readonly persistent?: boolean;
}
const presets: readonly RoomOptions[] = [
  {
    id: 'orion',
    name: 'Orion Belt',
    asteroidCount: 5,
    asteroidRespawnSeconds: 3.4,
    description: 'Balanced dogfight · standard hazards',
  },
  {
    id: 'nebula',
    name: 'Nebula Run',
    asteroidCount: 7,
    asteroidRespawnSeconds: 2.3,
    description: 'Dense rocks · faster reinforcements',
  },
  {
    id: 'zenith',
    name: 'Zenith Drift',
    asteroidCount: 3,
    asteroidRespawnSeconds: 5.2,
    description: 'Open skies · fewer asteroids',
  },
];
export class Room extends EventEmitter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly maxPlayers: number;
  readonly asteroidCount: number;
  readonly asteroidRespawnSeconds: number;
  readonly players = new Map<string, RoomPlayer>();
  persistent = false;
  logBackpressured = false;
  constructor({
    id = '',
    name,
    description = '',
    maxPlayers = 8,
    asteroidCount = 5,
    asteroidRespawnSeconds = 3.4,
  }: RoomOptions) {
    super();
    this.id = id;
    this.name = name;
    this.description = description;
    this.maxPlayers = maxPlayers;
    this.asteroidCount = asteroidCount;
    this.asteroidRespawnSeconds = asteroidRespawnSeconds;
    this.on('error', (error: Error) => console.error(`[Room ${this.id}]`, error));
  }
  get size(): number {
    return this.players.size;
  }
  snapshot() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      players: this.size,
      maxPlayers: this.maxPlayers,
      asteroidCount: this.asteroidCount,
      asteroidRespawnSeconds: this.asteroidRespawnSeconds,
    };
  }
  roster() {
    return [...this.players.values()].map(({ id, name }) => ({ id, name }));
  }
  /** Named typed event API; Node's EventEmitter remains the runtime transport. */
  onGameEvent(listener: (event: RoomEvent) => void): this {
    this.on('event', listener);
    return this;
  }
  offGameEvent(listener: (event: RoomEvent) => void): this {
    this.off('event', listener);
    return this;
  }
  private emitGameEvent(event: RoomEvent): void {
    this.emit('event', event);
  }
  join(player: RoomPlayer): void {
    if (this.players.size >= this.maxPlayers) throw new Error('Room is full');
    this.players.set(player.id, player);
    this.emit('join', player);
    this.emitGameEvent({
      t: Date.now(),
      type: 'join',
      room: this.id,
      player: player.id,
      name: player.name,
    });
  }
  leave(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    this.emit('leave', player);
    this.emitGameEvent({
      t: Date.now(),
      type: 'leave',
      room: this.id,
      player: id,
      name: player.name,
    });
    if (!this.players.size) this.emit('empty');
  }
  chat(player: RoomPlayer, message: string): void {
    if (!this.players.has(player.id)) return;
    const entry: RoomEvent = {
      t: Date.now(),
      type: 'chat',
      room: this.id,
      player: player.id,
      name: player.name,
      text: message,
    };
    this.emit('chat', entry);
    this.emitGameEvent(entry);
  }
}
export class RoomManager extends EventEmitter {
  readonly rooms = new Map<string, Room>();
  readonly maxRooms: number;
  readonly maxPlayers: number;
  readonly onRoom: ((room: Room) => void) | undefined;
  constructor({
    maxRooms = 24,
    maxPlayers = 8,
    seed = true,
    onRoom,
  }: {
    maxRooms?: number;
    maxPlayers?: number;
    seed?: boolean;
    onRoom?: (room: Room) => void;
  } = {}) {
    super();
    this.maxRooms = maxRooms;
    this.maxPlayers = maxPlayers;
    this.onRoom = onRoom;
    this.on('error', (error: Error) => console.error('[RoomManager]', error));
    if (seed) for (const item of presets) this.create({ ...item, maxPlayers, persistent: true });
  }
  create(input: RoomOptions): Room {
    if (this.rooms.size >= this.maxRooms) throw new Error('Room limit reached');
    const id = input.id || `sector-${Math.random().toString(36).slice(2, 10)}`;
    if (!/^[a-z0-9-]{1,40}$/.test(id) || this.rooms.has(id))
      throw new Error('Invalid or duplicate room ID');
    const room = new Room({
      ...input,
      id,
      maxPlayers: Math.min(input.maxPlayers || this.maxPlayers, this.maxPlayers),
    });
    room.persistent = Boolean(input.persistent);
    this.rooms.set(id, room);
    room.on('empty', () => {
      if (!room.persistent) {
        this.rooms.delete(id);
        this.emit('removed', id);
      }
    });
    this.emit('created', room);
    this.onRoom?.(room);
    return room;
  }
  list() {
    return [...this.rooms.values()].map((room) => room.snapshot());
  }
  get(id: string) {
    return this.rooms.get(id);
  }
}
