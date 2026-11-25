import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Logger } from 'pino';
import { parseClientMessage, ProtocolError, CLOSE, sendable } from './protocol.ts';
import { decodeInput, maskToControls } from '../../shared/codec.ts';
import { entityId } from '../../shared/types.ts';
import type { Room, RoomManager, RoomPlayer } from './rooms.ts';
import { RealtimeRooms } from './network/realtime.ts';
import type { RealtimePlayer } from './network/realtime.ts';
import type { ServerConfig } from './config.ts';
import type { WireInput } from '../../shared/types.ts';
import { logger as defaultLogger } from './logger.ts';
import type { Telemetry } from './telemetry.ts';

function hasSocket(value: RoomPlayer): value is RealtimePlayer {
  return 'socket' in value && value.socket instanceof WebSocket;
}
export function attachWebSockets(
  server: Server,
  rooms: RoomManager,
  config: ServerConfig,
  { logger = defaultLogger, telemetry }: { logger?: Logger; telemetry?: Telemetry } = {},
) {
  let accepting = true;
  const ipCounts = new Map<string, number>();
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
    telemetry?.recordOutgoing(Buffer.byteLength(message));
    socket.send(message, (error?: Error) => {
      if (error) logger.warn({ err: error }, 'WebSocket send error');
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

  const maxConnections = config.maxConnectionsPerIp ?? 8;
  const origins = config.allowedOrigins ?? [];
  const upgradeListener = (
    req: import('node:http').IncomingMessage,
    rawSocket: import('node:stream').Duplex,
    head: Buffer,
  ) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/ws') {
      rawSocket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    // Never trust X-Forwarded-For from an arbitrary client; use the TCP peer IP.
    const ip = req.socket.remoteAddress || 'unknown';
    const allowed =
      origins.length === 0 ||
      (typeof req.headers.origin === 'string' && origins.includes(req.headers.origin));
    if (!accepting || !allowed || (ipCounts.get(ip) || 0) >= maxConnections) {
      const status = !accepting
        ? '503 Service Unavailable'
        : !allowed
          ? '403 Forbidden'
          : '429 Too Many Requests';
      rawSocket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      logger.warn({ status, hasOrigin: Boolean(req.headers.origin) }, 'WebSocket upgrade rejected');
      return;
    }
    ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
    try {
      wss.handleUpgrade(req, rawSocket, head, (ws) => wss.emit('connection', ws, req));
    } catch (error: unknown) {
      const n = (ipCounts.get(ip) || 1) - 1;
      if (n <= 0) ipCounts.delete(ip);
      else ipCounts.set(ip, n);
      rawSocket.destroy();
      logger.warn({ err: error }, 'WebSocket handshake failed');
    }
  };
  server.on('upgrade', upgradeListener);
  wss.on('error', (error: Error) => logger.error({ err: error }, 'WebSocket server error'));
  wss.on('connection', (socket: WebSocket, req: import('node:http').IncomingMessage) => {
    const ip = req.socket.remoteAddress || 'unknown';
    let room: Room | null = null;
    let player: RealtimePlayer | null = null;
    let missedPongs = 0;
    let tokens = config.ratePerSecond;
    let inputTokens = 60;
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
    const close = (code: number, message: string): void => {
      if (socket.readyState === WebSocket.OPEN) socket.close(code, message.slice(0, 110));
    };
    socket.on('error', (error: Error) => logger.warn({ err: error }, 'WebSocket client error'));
    socket.on('pong', () => {
      missedPongs = 0;
    });
    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      // A flood queued before close(1008) must not keep parsing or logging in CLOSING state.
      if (socket.readyState !== WebSocket.OPEN) return;
      try {
        const now = Date.now();
        const elapsed = Math.max(0, (now - lastRefill) / 1000);
        tokens = Math.min(config.ratePerSecond, tokens + elapsed * config.ratePerSecond);
        inputTokens = Math.min(60, inputTokens + elapsed * 60);
        lastRefill = now;
        const bytes = Array.isArray(data) ? Buffer.concat(data) : data;
        telemetry?.recordIncoming(bytes.byteLength);
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
            if (msg.bots !== undefined) realTime.enableBots(selected, msg.bots);
            logger.info(
              { roomId: selected.id, playerId: member.id, netId: member.netId },
              'player joined',
            );
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
            logger.info(
              { roomId: room.id, playerId: player.id, textBytes: Buffer.byteLength(msg.text) },
              'chat accepted',
            );
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
        logger.warn(
          { roomId: room?.id, playerId: player?.id, message },
          'WebSocket protocol rejected',
        );
        close(error instanceof ProtocolError ? error.closeCode : CLOSE.INVALID, message);
      }
    });
    socket.on('close', () => {
      const remaining = (ipCounts.get(ip) || 1) - 1;
      if (remaining <= 0) ipCounts.delete(ip);
      else ipCounts.set(ip, remaining);
      clearTimeout(joinTimer);
      clearInterval(heartbeat);
      if (room && player) {
        logger.info({ roomId: room.id, playerId: player.id }, 'player disconnected');
        realTime.leave(room, player);
        room.leave(player.id);
      }
    });
  });

  return {
    wss,
    realTime,
    metrics: () => ({
      players: wss.clients.size,
      rooms: rooms.list().length,
      realtime: realTime.performance,
    }),
    async close(): Promise<void> {
      accepting = false;
      realTime.stop();
      rooms.off('created', addRoom);
      server.off('upgrade', upgradeListener);
      for (const socket of wss.clients) {
        if (socket.readyState === WebSocket.OPEN) {
          safeSend(socket, sendable('shutdown', { reason: 'Server maintenance' }), true);
          socket.close(1001, 'Server shutting down');
        } else socket.terminate();
      }
      // Allow clients to observe close code 1001; cap drain so SIGTERM never hangs.
      await new Promise<void>((resolve) => setTimeout(resolve, 800));
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
