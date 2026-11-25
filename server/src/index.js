import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.js';
import { RoomManager } from './rooms.js';
import { MatchLogStore } from './log/matchlog.js';
import { createHttpHandler } from './http.js';
import { attachWebSockets } from './ws.js';

const config = readConfig();
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const logs = new MatchLogStore(config.logDir);
const manager = new RoomManager({
  maxRooms: config.maxRooms,
  maxPlayers: config.maxPlayers,
  onRoom: (room) => {
    void logs.attach(room).catch((error) => room.emit('error', error));
  },
});
const server = createServer(
  createHttpHandler({
    rooms: manager,
    logs,
    distDir: resolve(root, 'client/dist'),
    slowDemo: config.slowDemo,
  }),
);
server.on('error', (error) => {
  console.error('[server]', error);
  process.exitCode = 1;
});
const sockets = attachWebSockets(server, manager, config);
server.listen(config.port, config.host, () => {
  const address = server.address();
  console.log(
    `[Space Arena Lab 04] http://${config.host}:${address.port} | rooms=${manager.list().length}`,
  );
  console.log('[HTTP] GET /health, GET/POST /api/rooms, GET /api/replays/:id | [WS] /ws');
});
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[shutdown] ${signal}: disconnect clients, flush NDJSON, close HTTP`);
  try {
    await sockets.close();
    await new Promise((resolve) => server.close(resolve));
    await logs.closeAll();
    console.log('[shutdown] complete');
    process.exitCode = 0;
  } catch (error) {
    console.error('[shutdown]', error);
    process.exitCode = 1;
  }
}
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
