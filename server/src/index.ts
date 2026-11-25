import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.ts';
import { RoomManager } from './rooms.ts';
import { MatchLogStore } from './log/matchlog.ts';
import { createHttpHandler } from './http.ts';
import { attachWebSockets } from './ws.ts';
import { logger } from './logger.ts';
import { Telemetry } from './telemetry.ts';

const config = readConfig();
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const logs = new MatchLogStore(config.logDir);
const telemetry = new Telemetry();
const manager = new RoomManager({
  maxRooms: config.maxRooms,
  maxPlayers: config.maxPlayers,
  onRoom: (room) => {
    void logs
      .attach(room)
      .catch((error: unknown) =>
        logger.error({ err: error, roomId: room.id }, 'match log attach failed'),
      );
  },
});
let stopping = false;
const server = createServer(
  createHttpHandler({
    rooms: manager,
    logs,
    distDir: resolve(root, 'client/dist'),
    slowDemo: config.slowDemo,
    metrics: () => telemetry.snapshot(manager, sockets.realTime),
    ready: () =>
      !stopping &&
      (manager.rooms.size < config.maxRooms ||
        [...manager.rooms.values()].some((room) => room.size < room.maxPlayers)),
    buildSha: config.buildSha,
    buildTag: config.buildTag,
  }),
);
const sockets = attachWebSockets(server, manager, config, { logger, telemetry });
server.on('error', (err: Error) => {
  logger.fatal({ err }, 'HTTP server failure');
  process.exit(1);
});
server.listen(config.port, config.host, () => {
  logger.info(
    {
      host: config.host,
      port: config.port,
      buildSha: config.buildSha,
      rooms: manager.list().length,
    },
    'server listening',
  );
});

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => {
    logger.fatal({ signal }, 'shutdown exceeded 9 seconds');
    process.exit(1);
  }, 9000);
  try {
    logger.info({ signal }, 'shutdown started');
    // Stop HTTP admission first, then tell all WebSocket players to return to the lobby.
    const closedHttp = new Promise<void>((resolve) => {
      server.close((error) => {
        if (error) logger.error({ err: error }, 'HTTP close error');
        resolve();
      });
      server.closeIdleConnections();
    });
    await sockets.close();
    await closedHttp;
    await logs.closeAll();
    telemetry.stop();
    logger.info({ signal }, 'shutdown complete');
    clearTimeout(deadline);
    process.exit(0);
  } catch (err: unknown) {
    logger.fatal({ err, signal }, 'shutdown failed');
    clearTimeout(deadline);
    process.exit(1);
  }
}
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandled rejection');
  process.exit(1);
});
