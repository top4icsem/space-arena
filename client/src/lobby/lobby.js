import { fetchJson } from '../assets/loader.js';
import { delay } from '../assets/loader.js';

/** Browser-native event emitter with a polling lifecycle and async iterator. */
export class Lobby extends EventTarget {
  constructor({
    endpoint = '/api/rooms',
    intervalMs = 5000,
    timeoutMs = 2400,
    fetchImpl = fetch,
  } = {}) {
    super();
    this.endpoint = endpoint;
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.rooms = [];
    this.visible = false;
    this.pollTimer = null;
    this.inFlight = null;
    this.generation = 0;
  }

  async refresh() {
    if (!this.visible) return this.rooms;
    if (this.inFlight) return this.rooms;
    const controller = new AbortController();
    this.inFlight = controller;
    const generation = this.generation;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(this.timeoutMs)]);
    try {
      const data = await fetchJson(this.endpoint, {
        signal,
        fetchImpl: this.fetchImpl,
        attempts: 1,
      });
      if (!Array.isArray(data?.rooms)) throw new Error('Room list has no rooms array');
      if (!this.visible || generation !== this.generation) return this.rooms;
      this.rooms = data.rooms;
      this.dispatchEvent(new CustomEvent('rooms', { detail: this.rooms }));
      return this.rooms;
    } catch (error) {
      if (this.visible && generation === this.generation && !controller.signal.aborted) {
        this.dispatchEvent(new CustomEvent('roomerror', { detail: error }));
      }
      return this.rooms;
    } finally {
      if (this.inFlight === controller) this.inFlight = null;
    }
  }

  start() {
    if (this.visible) return;
    this.visible = true;
    this.generation++;
    void this.refresh();
    this.pollTimer = setInterval(() => void this.refresh(), this.intervalMs);
  }

  stop() {
    this.visible = false;
    this.generation++;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.inFlight?.abort(new DOMException('Left the lobby', 'AbortError'));
    this.inFlight = null;
    this.dispatchEvent(new Event('stopped'));
  }

  join(name, roomId) {
    const cleanName = String(name).trim().slice(0, 20);
    const room = this.rooms.find((item) => item.id === roomId);
    if (!cleanName) throw new Error('Enter your pilot name');
    if (!room) throw new Error('Choose an available room');
    if (room.players >= room.maxPlayers) throw new Error('This room is full');
    this.stop();
    this.dispatchEvent(new CustomEvent('join', { detail: { name: cleanName, room } }));
  }

  /** Yield each refreshed list without busy waiting; cleanup always removes listeners. */
  async *updates({ signal } = {}) {
    const queue = [];
    let wake;
    const receive = (event) => {
      queue.push(event.detail);
      wake?.();
    };
    this.addEventListener('rooms', receive);
    try {
      if (this.rooms.length) yield this.rooms;
      while (!signal?.aborted && this.visible) {
        if (!queue.length) {
          await Promise.race([
            new Promise((resolve) => {
              wake = resolve;
            }),
            delay(this.intervalMs + 100, signal).catch(() => {}),
          ]);
          wake = null;
          if (signal?.aborted || !this.visible) return;
        }
        while (queue.length) yield queue.shift();
      }
    } finally {
      this.removeEventListener('rooms', receive);
    }
  }
}
