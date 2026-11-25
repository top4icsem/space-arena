import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { parseClientMessage, ProtocolError, CLOSE, sendable } from './protocol.js';

export function attachWebSockets(server, rooms, config) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxMessageBytes,
    perMessageDeflate: false,
  });
  const roster = (room) =>
    broadcast(room, sendable('roster', { room: room.id, players: room.roster() }));
  function safeSend(socket, message, critical = false) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 64 * 1024) {
      if (critical) socket.close(1013, 'Slow consumer');
      return; // Drop noncritical events, never let backlog grow without bounds.
    }
    socket.send(message, (error) => {
      if (error) console.error('[ws send]', error.message);
    });
  }
  function broadcast(room, text, critical = false) {
    for (const player of room.players.values()) safeSend(player.socket, text, critical);
  }
  const addRoom = (room) => {
    room.on('join', () => roster(room));
    room.on('leave', () => roster(room));
    room.on('chat', (event) =>
      broadcast(
        room,
        sendable('chat', {
          name: event.name,
          player: event.player,
          text: event.text,
          t: event.t,
        }),
      ),
    );
  };
  for (const room of rooms.rooms.values()) addRoom(room);
  rooms.on('created', addRoom);
  server.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('error', (error) => console.error('[WebSocketServer]', error));
  wss.on('connection', (socket) => {
    let room = null;
    let player = null;
    let missedPongs = 0;
    let tokens = config.ratePerSecond;
    let lastRefill = Date.now();
    let joined = false;
    const joinTimer = setTimeout(
      () => socket.close(CLOSE.JOIN_TIMEOUT, 'Join required in 5s'),
      5000,
    );
    const heartbeat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (++missedPongs >= 2) {
        socket.terminate();
        return;
      }
      socket.ping();
    }, 15000);
    const close = (code, message) => {
      if (socket.readyState === WebSocket.OPEN) socket.close(code, message.slice(0, 110));
    };
    socket.on('error', (error) => console.warn('[ws socket]', error.message));
    socket.on('pong', () => {
      missedPongs = 0;
    });
    socket.on('message', (data, isBinary) => {
      try {
        if (isBinary) throw new ProtocolError('JSON text messages only');
        const now = Date.now();
        tokens = Math.min(
          config.ratePerSecond,
          tokens + ((now - lastRefill) / 1000) * config.ratePerSecond,
        );
        lastRefill = now;
        if (tokens < 1) {
          close(CLOSE.RATE, 'Rate limit');
          return;
        }
        tokens -= 1;
        const msg = parseClientMessage(data, config.maxMessageBytes);
        if (!joined && msg.type !== 'join') throw new ProtocolError('First message must be join');
        if (msg.type === 'join') {
          if (joined) throw new ProtocolError('Already joined');
          room = rooms.get(msg.room);
          if (!room) throw new ProtocolError('Unknown room');
          if (room.size >= room.maxPlayers) throw new ProtocolError('Room full');
          joined = true;
          clearTimeout(joinTimer);
          player = { id: randomUUID(), name: msg.name.trim(), socket };
          room.join(player);
          safeSend(
            socket,
            sendable('joined', { id: player.id, room: room.id, name: player.name }),
            true,
          );
        } else if (msg.type === 'chat') {
          if (room?.logBackpressured) {
            safeSend(socket, sendable('error', { message: 'Log stream busy; retry chat' }));
            return;
          }
          room.chat(player, msg.text.trim());
        } else if (msg.type === 'leave') socket.close(1000, 'Left room');
      } catch (error) {
        console.warn('[ws protocol]', error.message);
        close(error.closeCode || CLOSE.INVALID, error.message);
      }
    });
    socket.on('close', () => {
      clearTimeout(joinTimer);
      clearInterval(heartbeat);
      if (room && player) room.leave(player.id);
    });
  });
  return {
    wss,
    async close() {
      rooms.off('created', addRoom);
      for (const socket of wss.clients) {
        if (socket.readyState === WebSocket.OPEN) socket.close(1001, 'Server shutting down');
        else socket.terminate();
      }
      // Allow close frames briefly, terminate remaining sockets and settle.
      await new Promise((resolve) => setTimeout(resolve, 150));
      for (const socket of wss.clients) socket.terminate();
      await new Promise((resolve) => wss.close(resolve));
    },
  };
}
