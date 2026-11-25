import { encodeInput, decodeSnapshot } from '../../../shared/codec.ts';
import { inputSeq } from '../../../shared/types.ts';
import type { EntityId, InputSeq } from '../../../shared/types.ts';

export interface JoinedMessage {
  readonly v: 0;
  readonly type: 'joined';
  readonly netId: EntityId;
  readonly room: string;
  readonly name: string;
  readonly seed: number;
  readonly tickRate: number;
  readonly wire: 'binary' | 'json';
}
interface Credentials {
  readonly v: 0;
  readonly type: 'join';
  readonly name: string;
  readonly room: string;
  readonly wire: 'binary' | 'json';
}
interface PendingJoin {
  resolve: (message: JoinedMessage) => void;
  reject: (error: Error) => void;
}
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function readJoined(value: Record<string, unknown>): JoinedMessage | null {
  if (
    value.type !== 'joined' ||
    value.v !== 0 ||
    typeof value.room !== 'string' ||
    typeof value.name !== 'string' ||
    (value.netId !== undefined &&
      (!Number.isInteger(value.netId) || typeof value.netId !== 'number')) ||
    (value.wire !== undefined && value.wire !== 'binary' && value.wire !== 'json')
  )
    return null;
  // Runtime boundary converts validated numeric ID to its nominal type.
  return {
    v: 0,
    type: 'joined',
    netId: entityId(typeof value.netId === 'number' ? value.netId : 0),
    room: value.room,
    name: value.name,
    seed: typeof value.seed === 'number' ? value.seed : 0,
    tickRate: typeof value.tickRate === 'number' ? value.tickRate : 30,
    wire: value.wire === 'json' ? 'json' : 'binary',
  };
}
import { entityId } from '../../../shared/types.ts';

/** The browser transport uses typed inputs; unknown network data is checked before dispatch. */
export class SocketConnection extends EventTarget {
  readonly url: string;
  readonly WebSocketImpl: typeof WebSocket;
  readonly maxQueue: number;
  readonly random: () => number;
  socket: WebSocket | null = null;
  queue: string[] = [];
  credentials: Credentials | null = null;
  attempt = 0;
  manual = true;
  timer: ReturnType<typeof setTimeout> | null = null;
  pendingJoin: PendingJoin | null = null;
  wire: 'binary' | 'json' = 'binary';
  constructor({
    url = null,
    WebSocketImpl = WebSocket,
    maxQueue = 32,
    random = Math.random,
  }: {
    url?: string | null;
    WebSocketImpl?: typeof WebSocket;
    maxQueue?: number;
    random?: () => number;
  } = {}) {
    super();
    this.url = url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    this.WebSocketImpl = WebSocketImpl;
    this.maxQueue = maxQueue;
    this.random = random;
  }
  get status(): 'connected' | 'disconnected' | 'reconnecting' {
    return this.socket?.readyState === this.WebSocketImpl.OPEN
      ? 'connected'
      : this.manual
        ? 'disconnected'
        : 'reconnecting';
  }
  emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  async join(
    name: string,
    room: string,
    wire: 'binary' | 'json' = 'binary',
  ): Promise<JoinedMessage> {
    this.disconnect();
    this.wire = wire;
    this.credentials = { v: 0, type: 'join', name, room, wire };
    this.manual = false;
    this.attempt = 0;
    return new Promise<JoinedMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.disconnect();
        reject(new Error('Join timed out'));
      }, 6000);
      this.pendingJoin = {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      };
      this.open();
    });
  }
  open(): void {
    if (this.manual || this.socket || !this.credentials) return;
    let socket: WebSocket;
    try {
      socket = new this.WebSocketImpl(this.url);
    } catch (error: unknown) {
      this.pendingJoin?.reject(new Error(errorText(error)));
      this.pendingJoin = null;
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.binaryType = 'arraybuffer';
    this.emit('status', 'connecting');
    socket.addEventListener('open', () => {
      if (socket !== this.socket) return;
      this.attempt = 0;
      socket.send(JSON.stringify(this.credentials));
      this.emit('status', 'connected');
    });
    socket.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data instanceof ArrayBuffer) {
        try {
          this.emit('snapshot', {
            frame: decodeSnapshot(event.data),
            bytes: event.data.byteLength,
          });
        } catch (error: unknown) {
          this.emit('status', `invalid snapshot: ${errorText(error)}`);
        }
        return;
      }
      if (typeof event.data !== 'string') return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!isObject(payload) || typeof payload.type !== 'string' || payload.v !== 0) return;
      if (payload.type === 'snapshot') {
        // The typed wire format is preferred; JSON is a Lab 05 comparison mode.
        if (isObject(payload) && Array.isArray(payload.players)) {
          this.emit('snapshot', {
            frame: payload,
            bytes: new TextEncoder().encode(event.data).byteLength,
          });
        }
      }
      if (payload.type === 'joined') {
        const joined = readJoined(payload);
        if (!joined) {
          this.emit('status', 'invalid joined message');
          return;
        }
        this.pendingJoin?.resolve(joined);
        this.pendingJoin = null;
        this.flush();
      }
      if (payload.type !== 'snapshot') this.emit(payload.type, payload);
    });
    socket.addEventListener('close', (event: CloseEvent) => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.emit('status', `offline (${event.code})`);
      if (this.pendingJoin && !this.manual) {
        this.pendingJoin.reject(
          new Error(`Server rejected join (${event.code}): ${event.reason || 'Disconnected'}`),
        );
        this.pendingJoin = null;
        this.manual = true;
      }
      if (!this.manual) this.scheduleRetry();
    });
    socket.addEventListener('error', () => this.emit('status', 'connection error'));
  }
  scheduleRetry(): void {
    if (this.manual) return;
    const delay =
      Math.min(8000, 400 * 2 ** Math.min(this.attempt++, 5)) * (0.8 + this.random() * 0.4);
    this.emit('status', `reconnecting in ${(delay / 1000).toFixed(1)}s`);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.open(), delay);
  }
  sendInput(seq: InputSeq, mask: number): number {
    if (this.manual || this.pendingJoin || this.socket?.readyState !== this.WebSocketImpl.OPEN)
      return 0;
    if (this.socket.bufferedAmount > 32 * 1024) return 0;
    if (this.wire === 'json') {
      const data = JSON.stringify({ v: 0, type: 'input', seq, mask });
      this.socket.send(data);
      return new TextEncoder().encode(data).byteLength;
    }
    const data = encodeInput({ seq: inputSeq(seq), mask });
    this.socket.send(data);
    return data.byteLength;
  }
  send(type: string, details: Record<string, unknown> = {}): boolean {
    if (this.manual || !this.credentials) return false;
    const message = JSON.stringify({ v: 0, type, ...details });
    if (this.socket?.readyState === this.WebSocketImpl.OPEN && !this.pendingJoin) {
      this.socket.send(message);
      return true;
    }
    if (this.queue.length >= this.maxQueue) this.queue.shift();
    this.queue.push(message);
    return true;
  }
  flush(): void {
    while (this.queue.length && this.socket?.readyState === this.WebSocketImpl.OPEN) {
      const next = this.queue.shift();
      if (next) this.socket.send(next);
    }
  }
  disconnect(): void {
    this.manual = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.credentials = null;
    this.queue.length = 0;
    this.pendingJoin?.reject(new Error('Disconnected'));
    this.pendingJoin = null;
    const socket = this.socket;
    this.socket = null;
    if (
      socket &&
      (socket.readyState === this.WebSocketImpl.OPEN ||
        socket.readyState === this.WebSocketImpl.CONNECTING)
    ) {
      socket.close(1000, 'Left lobby');
    }
    this.emit('status', 'disconnected');
  }
}
