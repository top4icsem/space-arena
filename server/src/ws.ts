import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { parseClientMessage, ProtocolError, CLOSE, sendable } from './protocol.ts';
import { decodeInput, maskToControls } from '../../shared/codec.ts';
import { entityId } from '../../shared/types.ts';
import type { Room, RoomManager, RoomPlayer } from './rooms.ts';
import { RealtimeRooms } from './network/realtime.ts';
import type { RealtimePlayer } from './network/realtime.ts';
import type { ServerConfig } from './config.ts';
import type { WireInput } from '../../shared/types.ts';

function hasSocket(value: RoomPlayer): value is RealtimePlayer {
  return 'socket' in value && value.socket instanceof WebSocket;
}
export function attachWebSockets(server: Server, rooms: RoomManager, config: ServerConfig) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxMessageBytes,
    perMessageDeflate: false,
  });
  function safeSend(socket: WebSocket, message: string | Buffer, critical = false): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 64 * 1024) {
      if (critical) socket.close(1013, 'Slow consumer');
      return;
    }
    socket.send(message, (error?: Error) => {
      if (error) console.error('[ws send]', error.message);
    });
  }
  const realTime = new RealtimeRooms(rooms, safeSend);
  realTime.start();
  function broadcast(room: Room, message: string): void {
    for (const participant of room.players.values())
      if (hasSocket(participant)) safeSend(participant.socket, message);
  }
  const roster = (room: Room) =>
    broadcast(room, sendable('roster', { room: room.id, players: room.roster() }));
  const addRoom = (room: Room) => {
    room.on('join', () => roster(room));
    room.on('leave', () => roster(room));
    room.on('chat', (event: { name: string; player: string; text: string; t: number }) =>
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
  wss.on('error', (error: Error) => console.error('[WebSocketServer]', error));
  wss.on('connection', (socket: WebSocket) => {
    let room: Room | null = null;
    let player: RealtimePlayer | null = null;
    let missedPongs = 0,
      tokens = config.ratePerSecond,
      inputTokens = 60;
    let lastRefill = Date.now(),
      joined = false;
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
    const close = (code: number, message: string): void => {
      if (socket.readyState === WebSocket.OPEN) socket.close(code, message.slice(0, 110));
    };
    socket.on('error', (error: Error) => console.warn('[ws socket]', error.message));
    socket.on('pong', () => {
      missedPongs = 0;
    });
    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      try {
        const now = Date.now(),
          elapsed = Math.max(0, (now - lastRefill) / 1000);
        tokens = Math.min(config.ratePerSecond, tokens + elapsed * config.ratePerSecond);
        inputTokens = Math.min(60, inputTokens + elapsed * 60);
        lastRefill = now;
        const bytes = Array.isArray(data) ? Buffer.concat(data) : data;
        let inputMessage: WireInput | null = null;
        if (isBinary) {
          if (!joined || player?.wire !== 'binary')
            throw new ProtocolError('Binary not negotiated');
          try {
            inputMessage = decodeInput(bytes);
          } catch {
            throw new ProtocolError('Malformed input frame');
          }
        }
        const msg: import('./protocol.ts').ParsedMessage = inputMessage
          ? { v: 0, type: 'input', ...inputMessage }
          : parseClientMessage(bytes, config.maxMessageBytes);
        const movement = msg.type === 'input';
        if ((movement ? inputTokens : tokens) < 1) {
          close(CLOSE.RATE, 'Rate limit');
          return;
        }
        if (movement) inputTokens--;
        else tokens--;
        if (!joined && msg.type !== 'join') throw new ProtocolError('First message must be join');
        switch (msg.type) {
          case 'join': {
            if (joined) throw new ProtocolError('Already joined');
            const selected = rooms.get(msg.room);
            if (!selected) throw new ProtocolError('Unknown room');
            if (selected.size >= selected.maxPlayers) throw new ProtocolError('Room full');
            const member: RealtimePlayer = {
              id: randomUUID(),
              name: msg.name.trim(),
              socket,
              wire: msg.wire || 'binary',
              netId: entityId(0),
            };
            const session = realTime.join(selected, member);
            room = selected;
            player = member;
            joined = true;
            clearTimeout(joinTimer);
            selected.join(member);
            // Demo bots live in the server world, not in browser prediction.
            if (msg.bots !== undefined) realTime.enableBots(selected, msg.bots);
            safeSend(
              socket,
              sendable('joined', {
                id: member.id,
                room: selected.id,
                name: member.name,
                wire: member.wire,
                ...session,
              }),
              true,
            );
            break;
          }
          case 'input': {
            if (!room || !player) throw new ProtocolError('Input before join');
            realTime.receive(room, player, msg, maskToControls);
            break;
          }
          case 'probe': {
            safeSend(socket, sendable('probe', { sent: msg.sent }));
            break;
          }
          case 'chat': {
            if (!room || !player) throw new ProtocolError('Chat before join');
            if (room.logBackpressured) {
              safeSend(socket, sendable('error', { message: 'Log stream busy; retry chat' }));
              break;
            }
            room.chat(player, msg.text.trim());
            break;
          }
          case 'leave':
            socket.close(1000, 'Left room');
            break;
          default: {
            const _: never = msg;
            throw new Error(`Unexpected message ${JSON.stringify(_)}`);
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Protocol error';
        console.warn('[ws protocol]', message);
        close(error instanceof ProtocolError ? error.closeCode : CLOSE.INVALID, message);
      }
    });
    socket.on('close', () => {
      clearTimeout(joinTimer);
      clearInterval(heartbeat);
      if (room && player) {
        realTime.leave(room, player);
        room.leave(player.id);
      }
    });
  });
  return {
    wss,
    realTime,
    async close(): Promise<void> {
      realTime.stop();
      rooms.off('created', addRoom);
      for (const socket of wss.clients) {
        if (socket.readyState === WebSocket.OPEN) socket.close(1001, 'Server shutting down');
        else socket.terminate();
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>((resolve, reject) => {
        wss.close((err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
