export const TICK_MS = 1000 / 30;
/** Drift-corrected setTimeout loop, target-clock based (never setInterval for physics). */
export class TickScheduler {
  constructor(
    step,
    { now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout } = {},
  ) {
    this.step = step;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.running = false;
    this.handle = null;
    this.next = 0;
  }
  start() {
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
      if (this.next < time) this.next = time + TICK_MS; // avoid spiral of death
      this.handle = this.schedule(frame, Math.max(0, this.next - this.now()));
    };
    this.handle = this.schedule(frame, TICK_MS);
  }
  stop() {
    this.running = false;
    if (this.handle !== null) this.cancel(this.handle);
    this.handle = null;
  }
}
