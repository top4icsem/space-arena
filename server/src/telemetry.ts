import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { RoomManager } from './rooms.ts';
import type { RealtimeRooms } from './network/realtime.ts';

type Traffic = { second: number; messages: number; bytesIn: number; bytesOut: number };
/** Five-second rolling traffic counters with bounded allocations and no player identifiers. */
export class Telemetry {
  private readonly traffic: Traffic[] = [];
  readonly eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  constructor() {
    this.eventLoopDelay.enable();
  }
  recordIncoming(bytes: number): void {
    this.record(bytes, true);
  }
  recordOutgoing(bytes: number): void {
    this.record(bytes, false);
  }
  private record(bytes: number, inbound: boolean): void {
    const second = Math.floor(Date.now() / 1000);
    this.prune(second);
    let entry = this.traffic[this.traffic.length - 1];
    if (!entry || entry.second !== second) {
      entry = { second, messages: 0, bytesIn: 0, bytesOut: 0 };
      this.traffic.push(entry);
    }
    if (inbound) {
      entry.messages++;
      entry.bytesIn += bytes;
    } else entry.bytesOut += bytes;
  }
  private prune(second: number): void {
    while (this.traffic.length && this.traffic[0]!.second < second - 4) this.traffic.shift();
  }
  snapshot(rooms: RoomManager, realtime: RealtimeRooms) {
    this.prune(Math.floor(Date.now() / 1000));
    const sum = this.traffic.reduce(
      (acc, bucket) => ({
        messages: acc.messages + bucket.messages,
        bytesIn: acc.bytesIn + bucket.bytesIn,
        bytesOut: acc.bytesOut + bucket.bytesOut,
      }),
      { messages: 0, bytesIn: 0, bytesOut: 0 },
    );
    const seconds = Math.min(5, Math.max(1, Math.ceil(process.uptime())));
    const mem = process.memoryUsage();
    const elu = performance.eventLoopUtilization();
    return {
      players: [...rooms.rooms.values()].reduce((count, room) => count + room.size, 0),
      rooms: rooms.rooms.size,
      messagesPerSecond: sum.messages / seconds,
      bytesInPerSecond: sum.bytesIn / seconds,
      bytesOutPerSecond: sum.bytesOut / seconds,
      stepMs: realtime.performance,
      eventLoopUtilization: elu.utilization,
      eventLoopDelayMs: Number.isFinite(this.eventLoopDelay.mean)
        ? this.eventLoopDelay.mean / 1e6
        : 0,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      uptimeSeconds: process.uptime(),
    };
  }
  stop(): void {
    this.eventLoopDelay.disable();
  }
}

export function prometheus(metrics: ReturnType<Telemetry['snapshot']>): string {
  const gauges: Record<string, number> = {
    arena_players: metrics.players,
    arena_rooms: metrics.rooms,
    arena_messages_per_second: metrics.messagesPerSecond,
    arena_bytes_received_per_second: metrics.bytesInPerSecond,
    arena_bytes_sent_per_second: metrics.bytesOutPerSecond,
    arena_step_p50_milliseconds: metrics.stepMs.p50,
    arena_step_p95_milliseconds: metrics.stepMs.p95,
    arena_step_p99_milliseconds: metrics.stepMs.p99,
    arena_event_loop_utilization: metrics.eventLoopUtilization,
    arena_event_loop_delay_milliseconds: metrics.eventLoopDelayMs,
    arena_memory_rss_bytes: metrics.memory.rss,
    arena_memory_heap_bytes: metrics.memory.heapUsed,
    arena_uptime_seconds: metrics.uptimeSeconds,
  };
  return Object.entries(gauges)
    .map(([key, raw]) => `# TYPE ${key} gauge\n${key} ${Number.isFinite(raw) ? raw : 0}\n`)
    .join('');
}
