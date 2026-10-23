/** Token bucket. `take()` returns false when the caller is over its rate. */
export class TokenBucket {
  private tokens: number
  private last: number

  constructor(
    private capacity: number,
    private refillPerSecond: number,
    now = Date.now(),
  ) {
    this.tokens = capacity
    this.last = now
  }

  take(cost = 1, now = Date.now()): boolean {
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((now - this.last) / 1000) * this.refillPerSecond,
    )
    this.last = now
    if (this.tokens < cost) return false
    this.tokens -= cost
    return true
  }
}

/** Per-key buckets (e.g. per IP) with lazy eviction of idle keys. */
export class KeyedLimiter {
  private buckets = new Map<string, TokenBucket>()

  constructor(
    private capacity: number,
    private refillPerSecond: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    let bucket = this.buckets.get(key)
    if (!bucket) {
      // ponytail: unbounded until next prune; prune() runs from the server sweep timer.
      bucket = new TokenBucket(this.capacity, this.refillPerSecond, now)
      this.buckets.set(key, bucket)
    }
    return bucket.take(1, now)
  }

  prune(): void {
    if (this.buckets.size > 10_000) this.buckets.clear()
  }
}
