import { encodeInput, decodeSnapshot } from '../../../shared/codec.js';
/** WebSocket transport: chat remains JSON; input and snapshots default to DataView binary. */
export class SocketConnection extends EventTarget {
  constructor({ url = null, WebSocketImpl = WebSocket, maxQueue = 32, random = Math.random } = {}) {
    super();
    this.url = url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    this.WebSocketImpl = WebSocketImpl;
    this.maxQueue = maxQueue;
    this.random = random;
    this.socket = null;
    this.queue = [];
    this.credentials = null;
    this.attempt = 0;
    this.manual = true;
    this.timer = null;
    this.pendingJoin = null;
    this.wire = 'binary';
  }
  get status() {
    return this.socket?.readyState === this.WebSocketImpl.OPEN
      ? 'connected'
      : this.manual
        ? 'disconnected'
        : 'reconnecting';
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  async join(name, room, wire = 'binary') {
    this.disconnect();
    this.wire = wire;
    this.credentials = { v: 0, type: 'join', name, room, wire };
    this.manual = false;
    this.attempt = 0;
    return new Promise((resolve, reject) => {
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
  open() {
    if (this.manual || this.socket || !this.credentials) return;
    let socket;
    try {
      socket = new this.WebSocketImpl(this.url);
    } catch (error) {
      this.pendingJoin?.reject(error);
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
    socket.addEventListener('message', (event) => {
      if (event.data instanceof ArrayBuffer) {
        try {
          this.emit('snapshot', {
            frame: decodeSnapshot(event.data),
            bytes: event.data.byteLength,
          });
        } catch (error) {
          this.emit('status', `invalid snapshot: ${error.message}`);
        }
        return;
      }
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload || typeof payload.type !== 'string' || payload.v !== 0) return;
      if (payload.type === 'snapshot')
        this.emit('snapshot', {
          frame: payload,
          bytes: new TextEncoder().encode(event.data).byteLength,
        });
      if (payload.type === 'joined') {
        this.pendingJoin?.resolve(payload);
        this.pendingJoin = null;
        this.flush();
      }
      if (payload.type !== 'snapshot') this.emit(payload.type, payload);
    });
    socket.addEventListener('close', (event) => {
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
  scheduleRetry() {
    if (this.manual) return;
    const delay =
      Math.min(8000, 400 * 2 ** Math.min(this.attempt++, 5)) * (0.8 + this.random() * 0.4);
    this.emit('status', `reconnecting in ${(delay / 1000).toFixed(1)}s`);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.open(), delay);
  }
  sendInput(seq, mask) {
    if (this.manual || this.pendingJoin || this.socket?.readyState !== this.WebSocketImpl.OPEN)
      return 0;
    if (this.socket.bufferedAmount > 32 * 1024) return 0;
    if (this.wire === 'json') {
      const data = JSON.stringify({ v: 0, type: 'input', seq, mask });
      this.socket.send(data);
      return new TextEncoder().encode(data).byteLength;
    }
    const data = encodeInput({ seq, mask });
    this.socket.send(data);
    return data.byteLength;
  }
  send(type, details = {}) {
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
  flush() {
    while (this.queue.length && this.socket?.readyState === this.WebSocketImpl.OPEN) {
      this.socket.send(this.queue.shift());
    }
  }
  disconnect() {
    this.manual = true;
    clearTimeout(this.timer);
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
