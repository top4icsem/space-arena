import { EventEmitter } from 'node:events';

const presets = [
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
  constructor({
    id,
    name,
    description = '',
    maxPlayers = 8,
    asteroidCount = 5,
    asteroidRespawnSeconds = 3.4,
  }) {
    super();
    Object.assign(this, {
      id,
      name,
      description,
      maxPlayers,
      asteroidCount,
      asteroidRespawnSeconds,
    });
    this.players = new Map();
    this.on('error', (error) => console.error(`[Room ${this.id}]`, error));
  }
  get size() {
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
  join(player) {
    if (this.players.size >= this.maxPlayers) throw new Error('Room is full');
    this.players.set(player.id, player);
    this.emit('join', player);
    this.emit('event', {
      t: Date.now(),
      type: 'join',
      room: this.id,
      player: player.id,
      name: player.name,
    });
  }
  leave(id) {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    this.emit('leave', player);
    this.emit('event', {
      t: Date.now(),
      type: 'leave',
      room: this.id,
      player: id,
      name: player.name,
    });
    if (!this.players.size) this.emit('empty');
  }
  chat(player, message) {
    if (!this.players.has(player.id)) return;
    const entry = {
      t: Date.now(),
      type: 'chat',
      room: this.id,
      player: player.id,
      name: player.name,
      text: message,
    };
    this.emit('chat', entry);
    this.emit('event', entry);
  }
}
export class RoomManager extends EventEmitter {
  constructor({ maxRooms = 24, maxPlayers = 8, seed = true, onRoom } = {}) {
    super();
    this.rooms = new Map();
    this.maxRooms = maxRooms;
    this.maxPlayers = maxPlayers;
    this.onRoom = onRoom;
    this.on('error', (error) => console.error('[RoomManager]', error));
    if (seed) for (const item of presets) this.create({ ...item, maxPlayers });
  }
  create(input) {
    if (this.rooms.size >= this.maxRooms) throw new Error('Room limit reached');
    const id = input.id || `sector-${Math.random().toString(36).slice(2, 10)}`;
    if (!/^[a-z0-9-]{1,40}$/.test(id) || this.rooms.has(id))
      throw new Error('Invalid or duplicate room ID');
    const room = new Room({
      ...input,
      id,
      maxPlayers: Math.min(input.maxPlayers || this.maxPlayers, this.maxPlayers),
    });
    this.rooms.set(id, room);
    room.once('empty', () => {
      this.rooms.delete(id);
      this.emit('removed', id);
    });
    this.emit('created', room);
    this.onRoom?.(room);
    return room;
  }
  list() {
    return [...this.rooms.values()].map((room) => room.snapshot());
  }
  get(id) {
    return this.rooms.get(id);
  }
}
