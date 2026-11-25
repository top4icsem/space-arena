export const TICK_MS = 1000 / 30;
/** Target clock loop: no setInterval for authoritative physics. */
export class TickScheduler {
  private readonly step: () => void;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, delay: number) => ReturnType<typeof setTimeout>;
  private readonly cancel: (handle: ReturnType<typeof setTimeout>) => void;
  running = false;
  handle: ReturnType<typeof setTimeout> | null = null;
  next = 0;
  constructor(
    step: () => void,
    {
      now = () => performance.now(),
      schedule = setTimeout,
      cancel = clearTimeout,
    }: {
      now?: () => number;
      schedule?: (fn: () => void, delay: number) => ReturnType<typeof setTimeout>;
      cancel?: (handle: ReturnType<typeof setTimeout>) => void;
    } = {},
  ) {
    this.step = step;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
  }
  start(): void {
    if (this.running) return;
    this.running = true;
    this.next = this.now() + TICK_MS;
    const frame = () => {
      if (!this.running) return;
      const time = this.now();
      let steps = 0;
      while (this.next <= time && steps < 3) {
        this.step();
        this.next += TICK_MS;
        steps++;
      }
      if (this.next < time) this.next = time + TICK_MS;
      this.handle = this.schedule(frame, Math.max(0, this.next - this.now()));
    };
    this.handle = this.schedule(frame, TICK_MS);
  }
  stop(): void {
    this.running = false;
    if (this.handle !== null) this.cancel(this.handle);
    this.handle = null;
  }
}
