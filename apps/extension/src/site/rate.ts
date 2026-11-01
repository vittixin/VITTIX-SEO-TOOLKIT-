/**
 * Paced async runner: caps concurrency and enforces a minimum interval
 * between request starts. Used by the site crawler (single loop, no bursts).
 */
export class PacedRunner {
  private readonly queue: (() => void)[] = [];
  private inFlight = 0;
  private lastStart = 0;
  private paceQueue: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(
    private readonly concurrency: number,
    private readonly minIntervalMs: number,
    private readonly delay: (ms: number) => Promise<void> = defaultDelay,
  ) {}

  /** Stop admitting new work; in-flight tasks finish. */
  stop(): void {
    this.stopped = true;
    for (const release of this.queue) release();
    this.queue.length = 0;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** Pace an additional HTTP request such as a manually observed redirect hop. */
  async pace(): Promise<void> {
    const task = this.paceQueue.then(async () => {
      const elapsed = Date.now() - this.lastStart;
      if (this.lastStart > 0 && elapsed < this.minIntervalMs)
        await this.delay(this.minIntervalMs - elapsed);
      this.lastStart = Date.now();
    });
    this.paceQueue = task.catch(() => {});
    await task;
  }

  /**
   * Run `task` when a slot opens and the pacing interval has elapsed.
   * Returns null immediately if the runner was stopped before admission.
   */
  async run<T>(task: () => Promise<T>): Promise<T | null> {
    if (this.stopped) return null;
    await this.acquire();
    if (this.stopped) {
      this.release();
      return null;
    }
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.inFlight >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.inFlight += 1;
    await this.pace();
  }

  private release(): void {
    this.inFlight -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
